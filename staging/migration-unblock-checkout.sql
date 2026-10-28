-- ============================================================================
-- Migration: Unblock Checkout when user changes plan or navigates back
-- ============================================================================

-- 1. Function to retire unpaid claims for a phone
CREATE OR REPLACE FUNCTION retire_unpaid_claims(
  p_phone TEXT,
  p_tenant_id VARCHAR DEFAULT 'thrivin'
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE checkout_claims
    SET status = 'retired', updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND phone = p_phone
      AND status IN ('created', 'cancel_pending', 'cancel_failed', 'in_flight')
      AND paid_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION retire_unpaid_claims(TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION retire_unpaid_claims(TEXT, VARCHAR) TO service_role;

-- 2. Update claim_checkout_order to retire old unpaid claim on plan change instead of blocking with unpaid_conflict
CREATE OR REPLACE FUNCTION claim_checkout_order(
  p_phone TEXT,
  p_required_steps INTEGER[],
  p_plan_key TEXT,
  p_terms_version TEXT,
  p_idempotency_key TEXT,
  p_inflight_ttl_seconds INTEGER DEFAULT 600,
  p_tenant_id VARCHAR DEFAULT 'thrivin'
) RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_steps JSONB;
  v_missing INTEGER[];
  v_terms BOOLEAN;
  v_claim_id UUID;
  v_existing RECORD;
  v_unpaid RECORD;
  v_blocked RECORD;
  v_unpaid_ttl INTERVAL := INTERVAL '1 hour';
BEGIN
  -- 1. Parameter format
  IF p_phone IS NULL OR p_phone !~ '^62[0-9]{8,13}$' THEN
    RETURN json_build_object('status', 'invalid_phone');
  END IF;
  IF p_plan_key IS NULL OR p_plan_key NOT IN ('month', 'quarter', 'half', 'year') THEN
    RETURN json_build_object('status', 'invalid_plan');
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 OR length(p_idempotency_key) > 200 THEN
    RETURN json_build_object('status', 'invalid_idempotency_key');
  END IF;

  -- 2. Idempotency replay
  SELECT id, phone, status, order_id, scalev_order_uuid, payment_url, paid_at INTO v_existing
  FROM checkout_claims
  WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key
  ORDER BY (status IN ('in_flight', 'created', 'cancel_pending', 'cancel_failed')) DESC,
           created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.phone <> p_phone THEN
      RETURN json_build_object('status', 'key_conflict');
    END IF;

    v_existing.order_id := NULLIF(v_existing.order_id, '');

    IF v_existing.paid_at IS NOT NULL THEN
      RETURN json_build_object('status', 'already_paid', 'claim_id', v_existing.id);
    END IF;

    IF v_existing.status = 'created' THEN
      IF v_existing.order_id IS NULL OR COALESCE(v_existing.payment_url, '') = '' THEN
        RETURN json_build_object('status', 'checkout_reconciliation', 'claim_id', v_existing.id);
      END IF;
      RETURN json_build_object(
        'status', 'already_created',
        'claim_id', v_existing.id,
        'order_id', v_existing.order_id,
        'payment_url', v_existing.payment_url
      );
    END IF;
    IF v_existing.status = 'in_flight' THEN
      RETURN json_build_object('status', 'in_flight', 'claim_id', v_existing.id);
    END IF;
    IF v_existing.status IN ('cancel_pending', 'cancel_failed') THEN
      RETURN json_build_object('status', v_existing.status, 'claim_id', v_existing.id);
    END IF;
    IF v_existing.status = 'retired' THEN
      SELECT id, plan_key, order_id, payment_url INTO v_unpaid
      FROM checkout_claims
      WHERE tenant_id = p_tenant_id AND phone = p_phone
        AND status = 'created' AND paid_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1;
      IF FOUND THEN
        IF v_unpaid.plan_key = p_plan_key THEN
          RETURN json_build_object(
            'status', 'reuse_unpaid',
            'claim_id', v_unpaid.id,
            'order_id', v_unpaid.order_id,
            'payment_url', v_unpaid.payment_url
          );
        END IF;
        -- Plan change: retire previous order
        UPDATE checkout_claims
          SET status = 'retired', updated_at = now()
          WHERE id = v_unpaid.id;
      END IF;
      BEGIN
        INSERT INTO checkout_claims (tenant_id, phone, idempotency_key, plan_key, status)
        VALUES (p_tenant_id, p_phone, p_idempotency_key, p_plan_key, 'in_flight')
        RETURNING id INTO v_claim_id;
      EXCEPTION WHEN unique_violation THEN
        RETURN json_build_object('status', blocked_live_status(p_tenant_id, p_phone));
      END;
      RETURN json_build_object('status', 'granted', 'claim_id', v_claim_id);
    END IF;
    IF v_existing.order_id IS NOT NULL OR COALESCE(v_existing.payment_url, '') <> '' THEN
      RETURN json_build_object(
        'status', 'already_created',
        'claim_id', v_existing.id,
        'order_id', v_existing.order_id,
        'payment_url', v_existing.payment_url
      );
    END IF;
    IF COALESCE(v_existing.scalev_order_uuid, '') <> '' THEN
      RETURN json_build_object('status', 'checkout_reconciliation', 'claim_id', v_existing.id);
    END IF;
    BEGIN
      UPDATE checkout_claims
        SET status = 'in_flight', plan_key = p_plan_key, updated_at = now()
        WHERE id = v_existing.id
        RETURNING id INTO v_claim_id;
    EXCEPTION WHEN unique_violation THEN
      RETURN json_build_object('status', blocked_live_status(p_tenant_id, p_phone));
    END;
    RETURN json_build_object('status', 'granted', 'claim_id', v_claim_id);
  END IF;

  -- 3. Expire stale in-flight claims
  UPDATE checkout_claims
    SET status = 'failed', updated_at = now()
    WHERE tenant_id = p_tenant_id AND phone = p_phone AND status = 'in_flight'
      AND created_at < now() - make_interval(secs => p_inflight_ttl_seconds);

  -- 4. Required onboarding steps
  SELECT steps INTO v_steps
  FROM onboarding_progress
  WHERE tenant_id = p_tenant_id AND phone = p_phone;

  SELECT array_agg(s) INTO v_missing
  FROM unnest(p_required_steps) AS s
  WHERE v_steps IS NULL OR NOT (v_steps ? s::text);

  IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
    RETURN json_build_object(
      'status', 'incomplete_onboarding',
      'missing_steps', to_json(v_missing)
    );
  END IF;

  -- 5. Terms consent
  SELECT value INTO v_terms
  FROM consent_events
  WHERE tenant_id = p_tenant_id AND phone = p_phone AND consent_type = 'terms'
    AND text_version = p_terms_version
  ORDER BY occurred_at DESC, (value = false) DESC, created_at DESC, id DESC
  LIMIT 1;

  IF COALESCE(v_terms, false) IS NOT TRUE THEN
    RETURN json_build_object('status', 'consent_required');
  END IF;

  -- 6. Unpaid order check: if same plan, reuse; if different plan, retire old and proceed
  SELECT id, plan_key, order_id, payment_url INTO v_unpaid
  FROM checkout_claims
  WHERE tenant_id = p_tenant_id AND phone = p_phone
    AND status = 'created' AND paid_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_unpaid.plan_key = p_plan_key THEN
      RETURN json_build_object(
        'status', 'reuse_unpaid',
        'claim_id', v_unpaid.id,
        'order_id', v_unpaid.order_id,
        'payment_url', v_unpaid.payment_url
      );
    END IF;
    -- Different plan selected: retire old unpaid claim to allow new order
    UPDATE checkout_claims
      SET status = 'retired', updated_at = now()
      WHERE id = v_unpaid.id;
  END IF;

  -- 7. Grant new claim
  BEGIN
    INSERT INTO checkout_claims (tenant_id, phone, idempotency_key, plan_key, status)
    VALUES (p_tenant_id, p_phone, p_idempotency_key, p_plan_key, 'in_flight')
    RETURNING id INTO v_claim_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('status', blocked_live_status(p_tenant_id, p_phone));
  END;

  RETURN json_build_object('status', 'granted', 'claim_id', v_claim_id);
END;
$function$;

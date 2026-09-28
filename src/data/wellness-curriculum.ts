export interface NinaMoment {
  context: string;
  userPrompt: string;
  ninaValue: string;
  whatsappMessage: string;
}

export interface TrackAdaptation {
  subtitle: string;
  application: string;
  practicalExample: string;
}

export interface Chapter {
  id: string;
  num: number;
  title: string;
  tagline: string;
  readTime: string;
  corePrinciple: string;
  trackAdaptations: {
    workout: TrackAdaptation;
    yoga: TrackAdaptation;
    casual: TrackAdaptation;
    diet: TrackAdaptation;
  };
  content: {
    lead: string;
    sections: {
      heading: string;
      body: string[];
      highlight?: string;
      table?: {
        headers: string[];
        rows: string[][];
      };
    }[];
    keyTakeaways: string[];
  };
  ninaMoment: NinaMoment;
}

export interface TrackInfo {
  id: 'workout' | 'yoga' | 'casual' | 'diet';
  name: string;
  shortDesc: string;
  iconName: string;
  badge: string;
  heroIntro: string;
}

export const WELLNESS_TRACKS: TrackInfo[] = [
  {
    id: "workout",
    name: "Strength & Workout",
    shortDesc: "Gym, Dumbbell, atau Calisthenics modal tubuh untuk bangun kekuatan & bentuk fisik.",
    iconName: "Dumbbell",
    badge: "Beban & Otot",
    heroIntro: "Sistem ilmiah melatih otot dan kekuatan — tanpa buang waktu di gym tanpa arah."
  },
  {
    id: "yoga",
    name: "Flexibility & Yoga",
    shortDesc: "Mobilitas sendi, kelenturan, postur tubuh, dan pelepasan ketegangan fisik.",
    iconName: "Sparkles",
    badge: "Mobilitas & Relaksasi",
    heroIntro: "Kuasai kelenturan bertahap, perbaiki postur, dan lepaskan stres tubuh dengan sains."
  },
  {
    id: "casual",
    name: "Casual Fitness",
    shortDesc: "Jogging santai, jalan kaki 10k langkah, dan olahraga ringan untuk stamina harian.",
    iconName: "Footprints",
    badge: "Stamina & Habit",
    heroIntro: "Membangun kebiasaan aktif yang menyatu dengan kesibukan kerja tanpa merasa terbebani."
  },
  {
    id: "diet",
    name: "Diet & Pola Makan",
    shortDesc: "Atur kalori, cukupi protein, dan nikmati makanan tanpa rasa bersalah atau diet ekstrem.",
    iconName: "Salad",
    badge: "Nutrisi & Kalori",
    heroIntro: "Pahami matematika tubuh sendiri. Turunkan lemak atau rawat energi tanpa kelaparan."
  }
];

export const WELLNESS_CHAPTERS: Chapter[] = [
  {
    id: "kenapa-susah-konsisten",
    num: 1,
    title: "Kenapa Kita Susah Konsisten Olahraga",
    tagline: "Spoiler: Bukan Karena Malas, Tapi Karena Tanpa Sistem",
    readTime: "4 menit baca",
    corePrinciple: "Tanpa sinyal progress yang terukur, motivasi punya tanggal kedaluwarsa.",
    trackAdaptations: {
      workout: {
        subtitle: "Di Dunia Angkat Beban & Workout",
        application: "Datang ke gym asal coba mesin tanpa program terstruktur adalah cara tercepat kehilangan semangat.",
        practicalExample: "Banyak orang mulai dengan dorongan semangat, latihan seminggu 5 kali sampai pegal parah, tapi tidak mencatat beban. Saat bulan kedua badan belum berubah, mereka berhenti."
      },
      yoga: {
        subtitle: "Di Dunia Yoga & Fleksibilitas",
        application: "Yoga tanpa roadmap membuatmu merasa tidak bertambah lentur dan hanya lelah meregangkan otot.",
        practicalExample: "Memaksakan pose sulit tanpa tahapan membuat sendi sakit. Padahal kelenturan adalah adaptasi saraf yang butuh sinyal teratur dan rasa aman tubuh."
      },
      casual: {
        subtitle: "Di Dunia Casual Fitness & Jogging",
        application: "Lari secepat mungkin di hari pertama hanya menghasilkan napas habis dan kapok berlari lagi.",
        practicalExample: "Orang yang baru mulai lari sering langsung memacu kecepatan tinggi. Setelah 1 km napas habis dan kaki kram. Besoknya sepatu lari masuk lemari."
      },
      diet: {
        subtitle: "Di Dunia Pengaturan Pola Makan",
        application: "Diet ekstrem serba rebus hanya bertahan 4 hari sebelum berakhir dengan pesta makan tengah malam.",
        practicalExample: "Memotong kalori drastis membuat hormon lapar melonjak. Tubuh membalas dendam dengan binging, bukan karena lo lemah tekad, tapi mekanisme biologis bertahan hidup."
      }
    },
    content: {
      lead: "Kalau kamu tanya orang yang pernah mulai olahraga tapi berhenti, hampir semua jawabannya sama: 'Males sih, ga ada waktu.' Tapi jujur? Itu bukan jawaban sebenarnya.",
      sections: [
        {
          heading: "Olahraga Itu Seperti Bisnis, Bukan Hobi",
          body: [
            "Coba bayangkan kamu membuka usaha. Kamu sudah invest waktu, uang, dan tenaga. Tapi setelah berbulan-bulan hasilnya nol — tidak ada pertumbuhan, tidak ada tanda-tanda bakal berhasil. Apakah kamu bakal tetap lanjut? Kemungkinan besar tidak.",
            "Dan itu bukan karena kamu pemalas — tapi karena kamu tidak melihat hasil dari sistem yang keliru. Aktivitas fisik apapun itu sama persis.",
            "Kebanyakan orang mulai dengan modal semangat saja. Mereka mengikuti video acak di YouTube, mencoba apa yang kelihatan keren, makan seadanya, lalu heran kenapa tubuh tidak berubah setelah berbulan-bulan."
          ],
          highlight: "Yang terjadi bukan kegagalan karakter. Yang terjadi adalah kegagalan sistem."
        },
        {
          heading: "Tiga Kesalahan Paling Umum (dan Paling Mahal)",
          body: [
            "1. Latihan Tanpa Arah yang Jelas: Datang, berputar-putar, mencoba apa yang sedang kosong. Ini namanya wandering — bergerak agar terlihat sibuk tapi tidak menuju ke mana-mana. Tubuh adaptif hanya pada tekanan terukur.",
            "2. Underestimate Soal Makan: 'Nanti dibakar kok pas olahraga.' Kenyataannya, kamu tidak bisa outrun a bad diet. Sebanyak apapun bergerak, kalau makannya salah, hasilnya mentok.",
            "3. Skip Recovery, Bangga Sama Rasa Sakit: Ada mitos 'No pain, no gain'. Padahal tubuh berkembang saat istirahat, bukan saat latihan. Latihan hanyalah trigger pembuka."
          ]
        },
        {
          heading: "Semangat vs Sistem",
          body: [
            "Bayangkan dua orang. Yang pertama datang hampir setiap hari, keringatan banyak, tapi makannya asal dan tidurnya berantakan.",
            "Yang kedua datang lebih jarang, tapi dia paham dasarnya: tubuhnya butuh apa, latihannya harus seberapa, dan kapan harus istirahat penuh.",
            "Yang kedua sampai ke tujuan jauh lebih cepat. Bukan karena lebih berbakat, tapi karena dia punya sistem yang masuk akal dan berkelanjutan."
          ]
        }
      ],
      keyTakeaways: [
        "Motivasi awal hanyalah pemicu; sistem terukurlah yang menjaga konsistensi.",
        "Tubuh manusia bekerja dengan aturan biologis yang bisa dipelajari dan dioptimalkan.",
        "Kamu tidak harus langsung sempurna, kamu hanya butuh arah yang tepat."
      ]
    },
    ninaMoment: {
      context: "Kamu punya niat kuat, tapi jadwal harianmu sering tak menentu antara kerjaan, keluarga, dan waktu luang?",
      userPrompt: "“Nina, gue mau mulai hidup aktif tapi jam kerja gue sering ga nentu. Gue harus mulai dari mana dulu?”",
      ninaValue: "Nina tidak akan memberimu jadwal kaku militer. Dia mendengarkan ritme aslimu dan merancang satu kebiasaan kecil pertama yang realistis.",
      whatsappMessage: "Halo Nina, aku baru baca Bab 1 di Thrivin. Aku mau mulai aktif tapi rutinitasku padat. Bisa bantu petakan langkah pertamaku?"
    }
  },
  {
    id: "matematika-tubuh-tdee",
    num: 2,
    title: "Matematika Tubuh: Kalori & TDEE",
    tagline: "Angka yang Mengubah Segalanya Tanpa Perlu Rumit",
    readTime: "5 menit baca",
    corePrinciple: "Kalori bukan musuh untuk ditakuti, melainkan mata uang energi tubuh untuk dikelola.",
    trackAdaptations: {
      workout: {
        subtitle: "Untuk Bangun Otot & Bentuk Badan",
        application: "Otot tidak bisa tumbuh dari udara kosong. Kamu butuh sedikit surplus kalori terukur atau kalori maintenance.",
        practicalExample: "Latihan beban keras tanpa kalori dan protein cukup hanya akan membuat tubuhmu kurus kering atau kelelahan kronis."
      },
      yoga: {
        subtitle: "Untuk Kelenturan & Energi Jernih",
        application: "Keseimbangan kalori membuat sistem saraf rileks dan otot elastis tanpa rasa lemas saat sesi yoga.",
        practicalExample: "Defisit kalori ekstrem memicu lonjakan hormon stres (kortisol) yang membuat otot kaku dan sulit rileks."
      },
      casual: {
        subtitle: "Untuk Jogging & Stamina",
        application: "Bakar kalori dari jalan santai dan lari ringan akan terasa sia-sia jika kamu 'balas dendam' makan gorengan sesudahnya.",
        practicalExample: "Lari 30 menit membakar ~250 kkal. Satu gelas boba manis mengandung ~450 kkal. Jangan sampai olahraga membuatmu merasa 'bebas makan apa saja'."
      },
      diet: {
        subtitle: "Untuk Fat Loss yang Sebenarnya",
        application: "Defisit kalori yang aman adalah 300–500 kkal di bawah TDEE, bukan kelaparan 1000 kkal.",
        practicalExample: "Makan di bawah TDEE sebesar 400 kkal per hari membakar lemak secara konsisten tanpa merusak metabolisme."
      }
    },
    content: {
      lead: "Kamu tidak perlu menjadi ahli gizi untuk mengerti bab ini. Kamu hanya perlu melihat tubuh dari satu hukum fisika dasar: berapa energi yang masuk, dibanding berapa yang keluar.",
      sections: [
        {
          heading: "Dari Mana Kalori Terbakar Setiap Hari?",
          body: [
            "Banyak orang mengira pembakar kalori terbesar adalah olahraga. Ternyata salah besar.",
            "• BMR (Basal Metabolic Rate): ~65% kalori terbakar hanya untuk mempertahankan organ hidup (jantung, otak, napas).",
            "• NEAT (Aktivitas Harian Biasa): ~20% terbakar dari jalan kaki, naik tangga, mengetik, bergerak.",
            "• Olahraga: hanya menyumbang ~10-15% total kalori harian.",
            "• Pencernaan (TEF): ~5-10% kalori dipakai untuk mencerna makanan."
          ],
          highlight: "Total energi harian inilah yang disebut TDEE (Total Daily Energy Expenditure)."
        },
        {
          heading: "Tiga Zona Kalori Sesuai Tujuanmu",
          body: [
            "Tidak ada zona yang paling suci — yang terbaik adalah yang sesuai dengan tujuanmu saat ini:",
            "1. Defisit Kalori (Fat Loss): Makan 300–500 kkal di bawah TDEE. Lemak menyusut bertahap tanpa mengorbankan otot.",
            "2. Maintenance (Rekomposisi Tubuh): Makan sama dengan TDEE. Lemak berkurang perlahan sambil otot mengencang.",
            "3. Surplus Kalori (Muscle Gain): Makan 200–350 kkal di atas TDEE untuk memberi bahan baku pertumbuhan jaringan baru."
          ],
          table: {
            headers: ["Tujuan", "Target Kalori", "Hasil yang Diharapkan"],
            rows: [
              ["Turunkan Lemak", "Defisit 300-500 kkal", "Turun 0.3 - 0.7 kg / minggu secara stabil"],
              ["Jaga Berat & Kencangkan", "Sesuai TDEE (±0)", "Bentuk tubuh lebih padat & berenergi"],
              ["Tambah Otot & Berisi", "Surplus 200-350 kkal", "Otot bertambah dengan lemak minimal"]
            ]
          }
        },
        {
          heading: "Tiga Makronutrien: Kualitas di Balik Angka",
          body: [
            "Kalori adalah gambaran kuantitas, makronutrien adalah kualitasnya:",
            "• Protein: Pembangun dan pelindung otot. Target umum: 1.6–2.2 gram per kg berat badan.",
            "• Karbohidrat: Bahan bakar utama otot dan otak. Bukan musuh — pilih karbohidrat utuh.",
            "• Lemak Sehat: Regulator hormon vital tubuh. Jangan pernah pangkas habis."
          ]
        }
      ],
      keyTakeaways: [
        "TDEE adalah titik keseimbangan berat badanmu saat ini.",
        "Pilih tujuan yang jelas: defisit terukur, maintenance, atau surplus terarah.",
        "Protein adalah prioritas utama makronutrien apa pun jenis olahragamu."
      ]
    },
    ninaMoment: {
      context: "Bingung menghitung TDEE dan target protein sesuai berat badan dan aktivitas nyatamu?",
      userPrompt: "“Nina, bantu hitung TDEE gue dong. Umur 26, berat 68kg, tinggi 172cm, seminggu olahraga 3x.”",
      ninaValue: "Nina menghitungkan angka baseline spesifik untukmu, lalu menjelaskan cara menerapkannya ke menu makanan harian Indonesia.",
      whatsappMessage: "Halo Nina, tolong bantu hitung TDEE dan target kalori harianku dari Bab 2 ya. Berat dan aktivitasku mau aku ceritain."
    }
  },
  {
    id: "progressive-overload",
    num: 3,
    title: "Progressive Overload",
    tagline: "Prinsip Utama yang Membuat Tubuhmu Mau Berkembang",
    readTime: "5 menit baca",
    corePrinciple: "Tubuh manusia malas secara biologis. Dia hanya akan berkembang jika diberi alasan konkret untuk berkembang.",
    trackAdaptations: {
      workout: {
        subtitle: "Untuk Latihan Beban",
        application: "Menambah beban bertahap (misal dari dumbbell 5kg ke 6kg) atau menambah 1-2 repetisi dengan beban yang sama.",
        practicalExample: "Jika minggu ini sanggup bicep curl 8 kg sebanyak 8 repetisi, targetkan minggu depan 8 kg sebanyak 10 repetisi."
      },
      yoga: {
        subtitle: "Untuk Fleksibilitas & Pose",
        application: "Meningkatkan kedalaman rentang gerak (range of motion) atau memperpanjang durasi menahan pose secara aman.",
        practicalExample: "Menahan pose Downward Dog dari 3 napas menjadi 5 napas dalam, atau meraih jari kaki sedikit lebih jauh tanpa membungkukkan punggung."
      },
      casual: {
        subtitle: "Untuk Lari & Jogging",
        application: "Meningkatkan jarak tempuh secara perlahan atau mempersingkat waktu tempuh tanpa memaksakan denyut jantung berlebih.",
        practicalExample: "Jika minggu lalu jalan/jogging santai 2.5 km dalam 25 menit, minggu ini tingkatkan ke 2.8 km atau selingi lari 3 menit dan jalan 2 menit."
      },
      diet: {
        subtitle: "Untuk Kebiasaan Makan",
        application: "Progressive overload pada diet adalah bertahap memperbaiki kualitas piring makan, bukan langsung mengganti semua menu sekaligus.",
        practicalExample: "Minggu 1: Tambah 1 butir telur di sarapan. Minggu 2: Kurangi minuman manis dari 5x seminggu jadi 2x seminggu."
      }
    },
    content: {
      lead: "Kalau kamu hanya boleh mengingat satu prinsip dari seluruh perjalanan ini, ingatlah ini: Tubuh manusia tidak akan membuang energi untuk memperkuat diri kecuali ada tekanan yang menantang adaptasinya.",
      sections: [
        {
          heading: "Bukan Latihan Sekeras Mungkin, Tapi Sedikit Lebih Menantang",
          body: [
            "Jika kamu mengangkat beban 20 kg minggu ini, 20 kg lagi bulan depan, dan 20 kg lagi tahun depan — tubuhmu tidak akan berubah. Dia sudah terbiasa.",
            "Progressive overload bukan berarti kamu harus menyiksa diri sampai pingsan tiap sesi. Kuncinya adalah penambahan kecil yang terukur:",
            "• Tambah beban sedikit (misal +1.25 kg atau +2.5 kg).",
            "• Tambah repetisi (dari 8 reps jadi 10 reps).",
            "• Tambah set (dari 3 set jadi 4 set).",
            "• Kurangi jeda istirahat (dari 90 detik jadi 75 detik).",
            "• Perbaiki Range of Motion (gerakan lebih dalam dan terkontrol).",
            "• Tambah durasi atau jarak tempuh."
          ],
          highlight: "Pilih satu variabel saja, tingkatkan perlahan, dan tubuhmu akan merespons."
        },
        {
          heading: "Supercompensation: Siklus Rahasia Pertumbuhan",
          body: [
            "Setiap kali latihan, kamu membuat stres mikro pada serat otot. Kamu menjadi lebih lelah dan lebih lemah untuk sementara waktu.",
            "Saat kamu istirahat dan makan cukup, tubuh memperbaiki kerusakan tersebut dan membangun kembali jaringan menjadi 'sedikit lebih kuat' dari sebelumnya. Siklus inilah yang dinamakan supercompensation.",
            "Jika kamu memotong istirahat atau tidak pernah menambah tantangan, siklus ini berhenti."
          ]
        },
        {
          heading: "Dua Jebakan Paling Sering Terjadi",
          body: [
            "1. Terlalu Cepat Naik Beban / Intensitas: Mengorbankan postur demi ego. Cedera selalu mengintai orang yang terburu-buru.",
            "2. Gonta-ganti Program Tiap Minggu: Tubuh butuh 8–12 minggu pada pola yang sama agar saraf dan jaringan otot bisa beradaptasi secara optimal."
          ]
        }
      ],
      keyTakeaways: [
        "Catat setiap sesimu — tanpa catatan, kamu hanya mengira-ngira progress.",
        "Kenaikan kecil 2.5% per minggu menghasilkan perubahan dramatis dalam setahun.",
        "Kualitas gerakan (form) selalu mengalahkan kuantitas beban atau jarak."
      ]
    },
    ninaMoment: {
      context: "Punya catatan latihan tapi bingung membaca apakah itu sudah terhitung progress atau belum?",
      userPrompt: "“Nina, minggu lalu squat 40kg 8 reps, hari ini 40kg 10 reps tapi agak goyang. Ini udah boleh naik beban belum?”",
      ninaValue: "Nina menganalisis apakah kenaikanmu sudah stabil secara mekanik sebelum kamu menambah beban, menghindari risiko cedera.",
      whatsappMessage: "Halo Nina, mau tanya soal catatan latihanku di Bab 3. Apakah capaianku minggu ini sudah terhitung progressive overload?"
    }
  },
  {
    id: "program-mingguan-optimal",
    num: 4,
    title: "Program Mingguan yang Optimal",
    tagline: "Frekuensi, Volume, dan Berapa Minimum yang Cukup",
    readTime: "5 menit baca",
    corePrinciple: "Program terbaik bukanlah yang terlihat paling impresif di atas kertas, melainkan yang cocok dengan hidupmu dan bisa kamu jalani konsisten.",
    trackAdaptations: {
      workout: {
        subtitle: "Struktur Latihan Beban",
        application: "Full Body 3x seminggu adalah titik mulai terbaik bagi sebagian besar orang bekerja.",
        practicalExample: "Senin, Rabu, Jumat: Setiap sesi melatih otot dorong (push), tarik (pull), dan kaki (legs) dengan 3-4 gerakan utama."
      },
      yoga: {
        subtitle: "Struktur Latihan Fleksibilitas",
        application: "Sesi pendek 20-30 menit 3-4x seminggu jauh lebih efektif daripada 1 kali sesi maraton 2 jam yang membuat sendi ngilu.",
        practicalExample: "Selang-seling antara sesi pembuka pinggul (hip opener), mobilitas tulang belakang (spinal mobility), dan peregangan menyeluruh."
      },
      casual: {
        subtitle: "Struktur Casual Fitness",
        application: "Membagi antara 3 hari jalan cepat/jogging santai 30 menit dan 2 hari latihan penguatan tubuh ringan di rumah.",
        practicalExample: "Selasa & Kamis jogging santai, Sabtu jalan pagi di taman, diselingi aktivitas harian aktif tanpa merasa dipaksa."
      },
      diet: {
        subtitle: "Struktur Ritme Makan Mingguan",
        application: "Konsistensi kalori mingguan lebih menentukan daripada stres karena satu kali makan siang bersama rekan kantor.",
        practicalExample: "Terapkan prinsip 80/20: 80% makanan utuh bernutrisi tinggi, 20% fleksibilitas sosial agar diet tidak memutus tali silaturahmi."
      }
    },
    content: {
      lead: "Banyak pemula bertanya: 'Berapa kali seminggu gue harus olahraga?' Dan jawaban umum yang sering mereka dengar adalah: 'Sebanyak mungkin!' Itu menyesatkan. Yang benar adalah: seberapa cukup.",
      sections: [
        {
          heading: "Frekuensi Sweet Spot Berbasis Sains",
          body: [
            "Riset fisiologi menunjukkan bahwa untuk merangsang adaptasi optimal:",
            "• Melatih kelompok otot atau kapasitas fisik 2 kali per minggu adalah sweet spot yang terbukti paling efisien.",
            "• 1 kali per minggu: stimulus kurang sering, adaptasi lambat.",
            "• 4 kali atau lebih pada otot yang sama: sering memicu kelelahan berlebih tanpa manfaat ekstra."
          ]
        },
        {
          heading: "Volume: Berapa Banyak yang Cukup?",
          body: [
            "Panduan umum: 10–20 set kerja per kelompok otot per minggu.",
            "Untuk pemula atau orang sibuk, 10–12 set per minggu sudah cukup memberikan 80% hasil maksimal (Hukum Pareto). Lebih banyak bukan berarti otomatis lebih baik jika tubuh tidak sempat pulih."
          ],
          table: {
            headers: ["Model Program", "Frekuensi", "Sangat Cocok Untuk"],
            rows: [
              ["Full Body", "3x / minggu", "Pemula, profesional sibuk, jadwal padat"],
              ["Upper / Lower", "4x / minggu", "Intermediate, ingin fokus volume terpisah"],
              ["Push / Pull / Legs", "5-6x / minggu", "Advanced, punya waktu pemulihan leluasa"]
            ]
          }
        },
        {
          heading: "Bagaimana Jika Aktivitasmu Bukan Angkat Beban?",
          body: [
            "Prinsipnya tetap sama: kamu butuh stimulus yang teratur, volume yang terkontrol, dan hari istirahat yang cukup.",
            "Runner fokus pada jarak tempuh mingguan (weekly mileage) dan tempo.",
            "Yogi fokus pada durasi, konsistensi napas, dan variasi fleksibilitas sendi."
          ]
        }
      ],
      keyTakeaways: [
        "Mulai dari Full Body 3x seminggu jika kamu memiliki rutinitas harian yang sibuk.",
        "Konsistensi menjalankan program sederhana mengalahkan program canggih yang hanya bertahan 2 minggu.",
        "Sisihkan minimal 1–2 hari istirahat total setiap minggu."
      ]
    },
    ninaMoment: {
      context: "Jadwal kerjamu sering lembur dan kamu bingung membagi waktu latihan?",
      userPrompt: "“Nina, gue cuma punya waktu 30-40 menit, 3 hari seminggu. Bisa susunkan menu latihan yang paling efisien?”",
      ninaValue: "Nina merancang split latihan yang efisien sesuai durasi waktu dan alat yang kamu miliki di rumah atau gym.",
      whatsappMessage: "Halo Nina, aku mau dibuatkan jadwal mingguan yang pas untuk waktuku dari Bab 4. Kapan kita bisa mulai petakan?"
    }
  },
  {
    id: "nutrisi-tanpa-ribet",
    num: 5,
    title: "Nutrisi Tanpa Ribet",
    tagline: "Protein, Karbo, dan Lemak dalam Bahasa Manusia Sehari-hari",
    readTime: "5 menit baca",
    corePrinciple: "Makan dengan tujuan, bukan dengan rasa bersalah.",
    trackAdaptations: {
      workout: {
        subtitle: "Nutrisi untuk Otot",
        application: "Prioritas mutlak: cukupi target protein harian agar latihan kerasmu terkonversi menjadi massa otot.",
        practicalExample: "Pastikan ada minimal satu sumber protein berkualitas (dada ayam, telur, tempe, tahu, ikan) di setiap jam makan utama."
      },
      yoga: {
        subtitle: "Nutrisi untuk Kelenturan Tubuh",
        application: "Hindari makanan olahan tinggi garam dan gula berlebih yang memicu inflamasi sendi dan retensi air.",
        practicalExample: "Perbanyak sayur berdaun hijau, air mineral cukup, dan lemak tak jenuh agar jaringan ikat tubuh tetap terhidrasi dan lentur."
      },
      casual: {
        subtitle: "Nutrisi untuk Pelari & Pejalan",
        application: "Karbohidrat kompleks adalah kawan baik energimu saat beraktivitas pagi.",
        practicalExample: "Makan pisang atau oatmeal 45 menit sebelum jogging pagi untuk cadangan glikogen tanpa perut begah."
      },
      diet: {
        subtitle: "Nutrisi untuk Fat Loss Tanpa Lapar",
        application: "Tingkatkan volume makanan dengan sayuran berserat tinggi dan protein agar kenyang lebih lama di kalori yang lebih hemat.",
        practicalExample: "Trik 'Piring Sehat': 1/2 piring sayur & serat, 1/4 piring lauk protein, 1/4 piring karbohidrat kompleks."
      }
    },
    content: {
      lead: "Nutrisi adalah topik yang paling sengaja dibuat membingungkan oleh industri suplemen dan tren diet instan. Kenyataannya jauh lebih sederhana: lo hanya butuh paham protein, karbohidrat, dan lemak.",
      sections: [
        {
          heading: "Protein: Prioritas Nomor Satu",
          body: [
            "Dari ketiga makronutrien, protein adalah yang paling krusial bagi siapa saja yang aktif secara fisik. Protein adalah bahan penyusun jaringan tubuh.",
            "• Target harian: 1.6–2.2 gram protein per kg berat badan.",
            "• Contoh: Orang dengan berat 65 kg membutuhkan sekitar 105–140 gram protein per hari.",
            "Sumber protein lokal yang terjangkau:"
          ],
          table: {
            headers: ["Sumber Bahan Makanan", "Kandungan Protein Rata-rata"],
            rows: [
              ["Dada Ayam Panggang (100g)", "~31 gram"],
              ["Ikan Laut / Tuna (100g)", "~25-26 gram"],
              ["Tempe (100g)", "~19-20 gram"],
              ["Telur Utuh (1 butir besar)", "~6 gram"],
              ["Tahu Putih (100g)", "~8-10 gram"]
            ]
          }
        },
        {
          heading: "Karbohidrat dan Lemak Bukanlah Musuh",
          body: [
            "• Karbohidrat: Bahan bakar performa latihan. Yang membuat berat badan naik bukan karbohidrat itu sendiri, melainkan total kalori yang berlebih melebihi TDEE.",
            "• Lemak Sehat: Kunci produksi hormon vital (termasuk hormon pertumbuhan dan metabolisme). Prioritaskan alpukat, kacang-kacangan, telur, dan minyak kelapa/zaitun."
          ]
        },
        {
          heading: "Cara Praktis Memulai Tanpa Timbangan Dapur",
          body: [
            "Kamu tidak harus langsung menimbang setiap butir nasi dengan timbangan digital jika itu membuatmu stres.",
            "Cukup gunakan panduan telapak tangan:",
            "• Telapak tangan = 1 porsi protein.",
            "• Kepalan tangan = 1 porsi sayuran segar.",
            "• Telungkup tangan = 1 porsi karbohidrat kompleks.",
            "• Jempol tangan = 1 porsi lemak sehat."
          ]
        }
      ],
      keyTakeaways: [
        "Cukupi protein terlebih dahulu di setiap kali kamu makan.",
        "Jangan menghilangkan kelompok makanan secara ekstrem tanpa indikasi medis.",
        "Hubungan yang sehat dengan makanan jauh lebih penting daripada diet sempurna selama 3 hari lalu menyerah."
      ]
    },
    ninaMoment: {
      context: "Sering makan di warteg, kafe, atau masakan rumah dan bingung apakah proteinmu sudah cukup?",
      userPrompt: "“Nina, tadi siang gue makan nasi padang lauk ayam bakar sama telur dadar. Protein gue kira-kira aman gak ya?”",
      ninaValue: "Nina bisa membaca menu makanan lokal Indonesia dan membantumu memperkirakan asupan nutrisi harian secara santai.",
      whatsappMessage: "Halo Nina! Aku mau konsultasi kebiasaan makan harianku dari Bab 5. Tolong bantu cek apakah protein dan porsiku sudah pas ya."
    }
  },
  {
    id: "recovery-sebagai-training",
    num: 6,
    title: "Recovery sebagai Training",
    tagline: "Tidur, Stres, dan Kenapa Istirahat Sering Diabaikan",
    readTime: "4 menit baca",
    corePrinciple: "Recovery bukan hadiah setelah latihan keras. Recovery adalah bagian dari latihan itu sendiri.",
    trackAdaptations: {
      workout: {
        subtitle: "Untuk Perbaikan Otot",
        application: "Otot tidak berkembang saat kamu mengangkat beban di gym; otot berkembang saat kamu tidur lelap di kasur.",
        practicalExample: "Beri jeda minimal 48 jam sebelum melatih kelompok otot besar yang sama agar sintesis protein selesai."
      },
      yoga: {
        subtitle: "Untuk Sistem Saraf Parasimpatis",
        application: "Latihan pernapasan (pranayama) dan meditasi mengaktifkan mode 'rest and digest' yang mempercepat perbaikan seluler.",
        practicalExample: "Lakukan pose restoratif seperti Legs-Up-The-Wall selama 10 menit sebelum tidur untuk meredakan kelelahan kaki."
      },
      casual: {
        subtitle: "Untuk Mencegah Cedera Tulang Kering & Sendi",
        application: "Pelari pemula sering terkena shin splints karena menambah jarak tanpa memberi waktu tulang beristirahat.",
        practicalExample: "Pastikan ada hari istirahat aktif (active recovery) berupa jalan santai ringan di sela hari lari."
      },
      diet: {
        subtitle: "Untuk Mengontrol Nafsu Makan",
        application: "Kurang tidur memicu hormon ghrelin (hormon lapar) melonjak dan menekan hormon leptin (hormon kenyang).",
        practicalExample: "Saat begadang, kamu cenderung mendambakan makanan manis dan berlemak tinggi keesokan harinya."
      }
    },
    content: {
      lead: "Ada paradoks menarik dalam dunia kebugaran: orang yang paling keras latihannya belum tentu yang paling cepat berkembang. Seringkali justru sebaliknya.",
      sections: [
        {
          heading: "Tidur: Senjata Paling Underrated",
          body: [
            "Kalau ada satu hal yang bisa kamu optimalkan tanpa keluar uang sepeser pun dan langsung melipatgandakan hasil latihanmu — itu adalah tidur.",
            "• Zona Optimal: 7–9 jam per malam.",
            "• Di bawah 6 jam: kualitas perbaikan jaringan turun drastis, risiko cedera meningkat 1.7x lipat, dan produksi hormon anabolik menurun.",
            "Kiat sederhana meningkatkan kualitas tidur:",
            "1. Konsistensi Jam Tidur: Bangun dan tidur di jam yang sama, termasuk saat akhir pekan.",
            "2. Redupkan Layar Gadget: Hindari cahaya biru HP 30–45 menit sebelum memejamkan mata."
          ]
        },
        {
          heading: "Stres Kerja dan Kortisol",
          body: [
            "Tubuh tidak bisa membedakan stres akibat deadline pekerjaan dengan stres akibat olahraga keras. Semuanya bermuara pada hormon kortisol.",
            "Jika kamu sedang mengalami minggu yang sangat berat di kantor, memaksakan latihan beban dengan intensitas maksimal justru bisa memicu kelelahan adrenal (burnout fisik)."
          ],
          highlight: "Kadang jawaban yang tepat bukanlah 'latihan lebih keras', melainkan penyesuaian yang bijak."
        }
      ],
      keyTakeaways: [
        "Orang dengan tidur berkualitas dan stres terkontrol selalu mengalahkan orang yang latihan keras tapi hidupnya berantakan.",
        "Dengarkan sinyal tubuh: lelah mental butuh latihan menenangkan, bukan pemaksaan ego.",
        "Istirahat adalah investasi pembentukan tubuh, bukan tanda kelemahan."
      ]
    },
    ninaMoment: {
      context: "Merasa lelah, kurang tidur, dan bimbang apakah hari ini harus memaksakan olahraga atau istirahat?",
      userPrompt: "“Nina, gue semalem cuma tidur 4 jam gara-gara lembur. Sore ini mending tetap latihan atau istirahat total ya?”",
      ninaValue: "Nina membantumu membaca kondisi tubuh hari ini: merekomendasikan apakah sebaiknya menurunkan intensitas, jalan santai, atau istirahat penuh.",
      whatsappMessage: "Halo Nina, kondisiku lagi agak capek dan kurang tidur seperti yang dibahas di Bab 6. Hari ini enaknya aku ngapain ya?"
    }
  },
  {
    id: "troubleshooting-plateau",
    num: 7,
    title: "Troubleshooting Plateau",
    tagline: "Kenapa Progressmu Stuck dan Cara Praktis Mengatasinya",
    readTime: "5 menit baca",
    corePrinciple: "Plateau bukan tembok kegagalan — ini pintu adaptasi tubuh. Kamu hanya butuh kunci diagnosa yang tepat.",
    trackAdaptations: {
      workout: {
        subtitle: "Saat Beban Angkatan Mentok",
        application: "Terapkan siklus Deload 1 minggu atau ganti rentang repetisi (misal dari 3x5 menjadi 3x10).",
        practicalExample: "Turunkan beban 40% selama satu minggu penuh, fokus pada teknik gerakan, lalu kembali ke beban semula dengan energi baru."
      },
      yoga: {
        subtitle: "Saat Sendi Terasa Tidak Tambah Lentur",
        application: "Kekakuan seringkali disebabkan oleh ketidakstabilan otot di sekitar sendi, bukan kurang ditarik.",
        practicalExample: "Perkuat otot glute dan core alih-alih hanya menarik hamstring berlebihan untuk mencapai pose forward fold."
      },
      casual: {
        subtitle: "Saat Pace Lari Stagnan",
        application: "Gunakan metode 80/20: 80% lari pada zona detak jantung rendah (Zone 2) yang nyaman diajak mengobrol.",
        practicalExample: "Melatih 'mesin aerobik' dengan lari santai justru membangun fondasi kecepatan untuk lari jarak jauh."
      },
      diet: {
        subtitle: "Saat Timbangan Berhenti Bergerak",
        application: "Hitung ulang TDEE dengan berat badan terkini; berat badan yang turun membakar kalori harian yang lebih sedikit.",
        practicalExample: "Lakukan 'Diet Break' selama 5–7 hari dengan makan di kalori maintenance sebelum kembali defisit."
      }
    },
    content: {
      lead: "Hampir semua orang yang konsisten berlatih akan mengalaminya di satu titik: tiba-tiba semua kemajuan berhenti. Beban tidak naik, berat badan diam, atau semangat terasa hambar. Selamat, kamu mencapai plateau.",
      sections: [
        {
          heading: "Tiga Jenis Plateau yang Paling Sering Muncul",
          body: [
            "1. Plateau Performa: Beban tidak naik atau pace lari jalan di tempat. Penyebab: stimulus monoton atau pemulihan saraf belum tuntas.",
            "2. Plateau Komposisi Tubuh: Berat badan stagnan selama >3 minggu berturut-turut. Penyebab: TDEE telah bergeser seiring menyusutnya tubuh, atau ada 'kalori tersembunyi' (saus, minyak, minuman kemasan).",
            "3. Plateau Mental: Masih berlatih, tapi rasa antusias hilang sama sekali. Ini adalah alarm awal dari overtraining atau kebosanan rutinitas."
          ]
        },
        {
          heading: "Deload: Mundur Selangkah untuk Melompat Dua Langkah",
          body: [
            "Deload adalah strategi periodisasi yang digunakan atlet profesional di seluruh dunia.",
            "Selama 1 minggu, kamu sengaja memotong beban atau volume latihan sebesar 40–50%.",
            "Bukan libur total — kamu tetap bergerak dan menjaga ritme kebiasaan, tetapi memberi ruang bagi sistem saraf dan sendi untuk pulih total."
          ],
          highlight: "Satu perubahan pada satu waktu. Jangan panik lalu mengubah jadwal, diet, dan beban sekaligus."
        }
      ],
      keyTakeaways: [
        "Plateau adalah tanda biologis bahwa tubuhmu sukses beradaptasi dengan level latihan sebelumnya.",
        "Cari akar masalah sebelum bereaksi: apakah karena tidur, nutrisi, atau volume latihan?",
        "Deload adalah langkah strategis, bukan kemunduran."
      ]
    },
    ninaMoment: {
      context: "Merasa sudah berusaha keras berminggu-minggu tapi angka timbangan atau performamu jalan di tempat?",
      userPrompt: "“Nina, udah 3 minggu berat badan gue ga turun padahal defisitnya masih sama. Gue salah di mana ya?”",
      ninaValue: "Nina membantumu mengaudit variabel mingguan secara objektif tanpa membuatmu panik atau memangkas kalori secara serampangan.",
      whatsappMessage: "Halo Nina, progressku rasanya lagi mentok di plateau (Bab 7). Mau minta bantuanmu buat diagnosa kondisiku sekarang."
    }
  },
  {
    id: "meet-nina-companion",
    num: 8,
    title: "Meet Nina: Companion Pribadimu",
    tagline: "Sahabat Perjalananmu untuk Menerapkan Semua Ini di WhatsApp",
    readTime: "4 menit baca",
    corePrinciple: "Mengetahui apa yang harus dilakukan tidak sama dengan mampu menjalaninya sendirian.",
    trackAdaptations: {
      workout: {
        subtitle: "Pendamping Latihan Bebanmu",
        application: "Nina mengingat beban terakhirmu, mengingatkan jadwal sesi, dan mengecek form latihanmu.",
        practicalExample: "Tiap kali selesai latihan, cukup kirim: 'Chest day done, bench 45kg 8 reps'. Nina menyimpan konteks progresmu."
      },
      yoga: {
        subtitle: "Pendamping Fleksibilitasmu",
        application: "Nina menemani sesi mindfulness harian dan mengingatkanmu untuk rileks di tengah hari kerja yang tegang.",
        practicalExample: "Nina mengirimkan dorongan lembut: 'Sudah duduk seharian? Yuk luangkan 5 menit peregangan leher & bahu sore ini.'"
      },
      casual: {
        subtitle: "Akuntabilitas Keseharianmu",
        application: "Menjaga langkah kaki harian dan menyemangati saat kamu malas beranjak dari sofa.",
        practicalExample: "Nina menyapa ringan: 'Hari ini baru 3.000 langkah. Mau jalan santai 15 menit keliling komplek sambil dengar lagu?'"
      },
      diet: {
        subtitle: "Teman Diskusi Pola Makan",
        application: "Membantu memilih menu makan tanpa penghakiman atau rasa bersalah.",
        practicalExample: "Foto piring makan siangmu dan tanyakan: 'Nina, porsi sayur sama ikanku segini kira-kira pas gak buat target defisitku?'"
      }
    },
    content: {
      lead: "Kamu sudah membaca fondasi sainsnya: sistem mengalahkan motivasi, hukum TDEE, progressive overload, nutrisi seimbang, pentingnya recovery, dan cara keluar dari plateau. Semua teori itu sekarang ada di tanganmu.",
      sections: [
        {
          heading: "Siapa Sebenarnya Nina?",
          body: [
            "Nina bukan chatbot generik yang menjawab dengan template kaku seperti mesin pencari. Nina adalah AI Companion pribadi yang dirancang khusus untuk mendampingi prosesmu menerapkan sains kebugaran ke dunia nyata.",
            "Nina hadir di WhatsApp — aplikasi yang sudah ada di sakumu setiap hari. Kamu tidak perlu mengunduh aplikasi baru yang berat atau membiasakan diri dengan dashboard rumit."
          ]
        },
        {
          heading: "Loop Sederhana Bersama Nina",
          body: [
            "Hubunganmu dengan Nina berjalan lewat 5 langkah natural:",
            "1. Plan: Nina membantumu menentukan apa yang ingin kamu capai minggu ini.",
            "2. Do: Kamu menjalaninya dengan tenang.",
            "3. Check-in: Ceritakan apa yang terjadi secara santai ('Latihan selesai', atau 'Hari ini capek banget gak sempat lari').",
            "4. Learn: Nina membantu membaca pola dan progressmu.",
            "5. Adjust: Rencana disesuaikan dengan kehidupan nyatamu, bukan memaksakan hidupmu ikut rencana kaku."
          ],
          highlight: "Nina ada untuk membantumu berpikir lebih jernih dan konsisten — bukan menggantikan proses berpikirmu."
        },
        {
          heading: "Kamu Tahu Aturannya. Sekarang Waktunya Melangkah Bersama.",
          body: [
            "Pengetahuan tanpa tindakan akan tetap nol. Langkah pertama tidak harus sempurna, dan kamu tidak perlu mengerti segalanya sebelum mulai.",
            "Yang kamu butuhkan hanyalah satu keputusan: mulai hari ini, dengan apa yang kamu punya, dari titik di mana kamu berada saat ini.",
            "Dan kamu tidak perlu menjalaninya sendirian lagi."
          ]
        }
      ],
      keyTakeaways: [
        "Website adalah tempat kamu mempelajari ilmunya secara terstruktur.",
        "WhatsApp adalah tempat kamu menjalaninya setiap hari bersama Nina.",
        "Never Grow Alone."
      ]
    },
    ninaMoment: {
      context: "Siap membawa semua ilmu yang kamu pelajari menjadi hasil nyata dalam hidupmu?",
      userPrompt: "“Hai Nina! Aku sudah selesai baca silabus Wellness di Thrivin. Mau mulai jalanin perjalananku bareng kamu.”",
      ninaValue: "Nina langsung menyambutmu secara personal, mendengarkan titik awalmu, dan menjadi teman perjalanan harianmu.",
      whatsappMessage: "Halo Nina! Aku baru saja menyelesaikan silabus Wellness di Thrivin. Aku ingin memulai perjalananku bersama kamu."
    }
  }
];

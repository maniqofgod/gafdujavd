import React from 'react';

function PrivacyPolicy({ onBack }) {
  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-cyan-400 mr-4"
        >
          ← Kembali
        </button>
        <h1 className="page-title">Kebijakan Privasi</h1>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto">
        <div className="bg-gradient-to-br from-gray-800 to-gray-750 rounded-2xl overflow-hidden shadow-2xl border border-cyan-500/10">
          <div className="bg-gradient-to-r from-cyan-600/20 to-blue-600/20 p-8 border-b border-cyan-500/20">
            <h2 className="text-3xl font-bold text-white mb-2">Kebijakan Privasi</h2>
            <p className="text-gray-300 text-lg">Auto Clipper AI</p>
            <p className="text-sm text-gray-400 mt-2">Terakhir diperbarui: {new Date().toLocaleDateString('id-ID')}</p>
          </div>

          <div className="p-8 space-y-8 text-gray-300">
            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">1. Pengumpulan Informasi</h3>
              <p className="leading-relaxed mb-4">
                Kami mengumpulkan informasi berikut untuk menyediakan layanan Auto Clipper AI:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Token akses OAuth dari platform media sosial (YouTube, TikTok)</li>
                <li>Informasi profil dasar dari akun yang terhubung</li>
                <li>Data penggunaan aplikasi untuk keperluan analitik</li>
                <li>File video yang Anda upload untuk diproses</li>
              </ul>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">2. Penggunaan Informasi</h3>
              <p className="leading-relaxed mb-4">
                Informasi yang kami kumpulkan digunakan untuk:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Menyediakan fitur upload ke platform media sosial</li>
                <li>Memproses video dengan AI (clipping, subtitle)</li>
                <li>Meningkatkan kualitas layanan aplikasi</li>
                <li>Memastikan keamanan dan keaslian pengguna</li>
              </ul>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">3. OAuth dan Platform Media Sosial</h3>
              <p className="leading-relaxed mb-4">
                Ketika Anda menghubungkan akun media sosial:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Kami hanya menyimpan token akses yang diberikan oleh platform</li>
                <li>Kami tidak menyimpan kata sandi akun Anda</li>
                <li>Token akses digunakan hanya untuk upload konten atas nama Anda</li>
                <li>Anda dapat mencabut akses kapan saja melalui pengaturan platform</li>
              </ul>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">4. Penyimpanan Data</h3>
              <p className="leading-relaxed mb-4">
                Data Anda disimpan dengan aman:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Token OAuth dienkripsi dan disimpan secara lokal</li>
                <li>File video diproses secara lokal di perangkat Anda</li>
                <li>Data tidak dikirim ke server eksternal kecuali untuk upload ke platform tujuan</li>
              </ul>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">5. Berbagi Data</h3>
              <p className="leading-relaxed">
                Kami tidak menjual atau membagikan data pribadi Anda kepada pihak ketiga, kecuali:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Dengan izin eksplisit Anda</li>
                <li>Untuk memenuhi kewajiban hukum</li>
                <li>Untuk melindungi hak dan keselamatan pengguna</li>
                <li>Ketika diperlukan untuk menyediakan layanan (upload ke platform media sosial)</li>
              </ul>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">6. Keamanan Data</h3>
              <p className="leading-relaxed">
                Kami menerapkan langkah-langkah keamanan teknis dan organisasi yang sesuai untuk melindungi data pribadi Anda dari akses yang tidak sah, kehilangan, atau perusakan.
              </p>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">7. Hak Anda</h3>
              <p className="leading-relaxed mb-4">
                Anda memiliki hak untuk:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Mengakses data pribadi yang kami simpan</li>
                <li>Memperbaiki data yang tidak akurat</li>
                <li>Menghapus data Anda</li>
                <li>Menolak pemrosesan data</li>
                <li>Mencabut izin OAuth kapan saja</li>
              </ul>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">8. Cookie dan Teknologi Pelacakan</h3>
              <p className="leading-relaxed">
                Aplikasi ini mungkin menggunakan teknologi pelacakan untuk meningkatkan pengalaman pengguna dan menganalisis penggunaan aplikasi. Data ini dikumpulkan secara anonim dan tidak dapat diidentifikasi secara pribadi.
              </p>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">9. Perubahan Kebijakan</h3>
              <p className="leading-relaxed">
                Kami dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu. Perubahan akan diberitahukan melalui aplikasi atau email jika tersedia.
              </p>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">10. Kontak Kami</h3>
              <p className="leading-relaxed">
                Jika Anda memiliki pertanyaan tentang Kebijakan Privasi ini, silakan hubungi kami melalui repository GitHub atau email pengembang.
              </p>
            </section>

            <div className="border-t border-gray-600 pt-6 mt-8">
              <p className="text-sm text-gray-400 text-center">
                Kebijakan Privasi ini berlaku untuk Auto Clipper AI dan layanan terkaitnya.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PrivacyPolicy;

import React from 'react';

function TermsOfService({ onBack }) {
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
        <h1 className="page-title">Syarat dan Ketentuan Layanan</h1>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto">
        <div className="bg-gradient-to-br from-gray-800 to-gray-750 rounded-2xl overflow-hidden shadow-2xl border border-cyan-500/10">
          <div className="bg-gradient-to-r from-cyan-600/20 to-blue-600/20 p-8 border-b border-cyan-500/20">
            <h2 className="text-3xl font-bold text-white mb-2">Syarat dan Ketentuan Layanan</h2>
            <p className="text-gray-300 text-lg">Auto Clipper AI</p>
            <p className="text-sm text-gray-400 mt-2">Terakhir diperbarui: {new Date().toLocaleDateString('id-ID')}</p>
          </div>

          <div className="p-8 space-y-8 text-gray-300">
            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">1. Penerimaan Syarat</h3>
              <p className="leading-relaxed">
                Dengan mengakses dan menggunakan Auto Clipper AI ("Aplikasi"), Anda menyetujui untuk terikat oleh Syarat dan Ketentuan Layanan ini ("Syarat"). Jika Anda tidak setuju dengan Syarat ini, mohon untuk tidak menggunakan Aplikasi.
              </p>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">2. Deskripsi Layanan</h3>
              <p className="leading-relaxed mb-4">
                Auto Clipper AI adalah platform manajemen konten media sosial yang menyediakan fitur-fitur berikut:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Pemotongan video otomatis menggunakan AI</li>
                <li>Generasi subtitle/caption otomatis</li>
                <li>Upload video ke platform media sosial (YouTube, TikTok)</li>
                <li>Manajemen konten multi-platform</li>
                <li>Pengolahan dan editing video</li>
              </ul>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">3. Akun Pengguna</h3>
              <p className="leading-relaxed mb-4">
                Untuk menggunakan fitur upload ke platform media sosial, Anda diharuskan membuat akun dan memberikan akses OAuth ke platform terkait.
              </p>
              <p className="leading-relaxed">
                Anda bertanggung jawab untuk menjaga kerahasiaan kredensial akun Anda dan semua aktivitas yang terjadi di bawah akun Anda.
              </p>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">4. Konten Pengguna</h3>
              <div className="space-y-4">
                <p className="leading-relaxed">
                  Anda bertanggung jawab penuh atas konten yang Anda upload melalui Aplikasi. Anda menjamin bahwa:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Anda memiliki hak untuk menggunakan dan mendistribusikan konten tersebut</li>
                  <li>Konten tidak melanggar hak cipta, merek dagang, atau hak kekayaan intelektual lainnya</li>
                  <li>Konten tidak mengandung materi yang ilegal, berbahaya, atau menyinggung</li>
                  <li>Konten mematuhi kebijakan platform tujuan (YouTube, TikTok, dll.)</li>
                </ul>
              </div>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">5. Penggunaan yang Dilarang</h3>
              <p className="leading-relaxed mb-4">Anda dilarang menggunakan Aplikasi untuk:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Mengupload konten yang melanggar hukum atau kebijakan platform</li>
                <li>Menyebarkan malware, virus, atau kode berbahaya</li>
                <li>Spam atau aktivitas yang mengganggu pengguna lain</li>
                <li>Mencoba mengakses sistem tanpa otorisasi</li>
                <li>Menggunakan Aplikasi untuk tujuan komersial tanpa izin tertulis</li>
              </ul>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">6. Hak Cipta dan Kekayaan Intelektual</h3>
              <p className="leading-relaxed">
                Aplikasi Auto Clipper AI dan semua fiturnya dilindungi oleh hak cipta dan hukum kekayaan intelektual. Anda tidak diperbolehkan menyalin, memodifikasi, atau mendistribusikan Aplikasi tanpa izin tertulis dari pemilik.
              </p>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">7. Penolakan Jaminan</h3>
              <p className="leading-relaxed">
                Aplikasi disediakan "sebagaimana adanya" tanpa jaminan apapun. Kami tidak menjamin bahwa Aplikasi akan bebas dari kesalahan atau akan memenuhi kebutuhan spesifik Anda. Kami tidak bertanggung jawab atas kerugian yang timbul dari penggunaan Aplikasi.
              </p>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">8. Batasan Tanggung Jawab</h3>
              <p className="leading-relaxed">
                Dalam hal apapun, kami tidak bertanggung jawab atas kerugian langsung, tidak langsung, insidental, atau konsekuensial yang timbul dari penggunaan atau ketidakmampuan menggunakan Aplikasi.
              </p>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">9. Pengakhiran Layanan</h3>
              <p className="leading-relaxed">
                Kami berhak untuk mengakhiri atau menangguhkan akses Anda ke Aplikasi kapan saja, tanpa pemberitahuan sebelumnya, jika Anda melanggar Syarat ini.
              </p>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">10. Perubahan Syarat</h3>
              <p className="leading-relaxed">
                Kami berhak untuk mengubah Syarat ini kapan saja. Perubahan akan berlaku segera setelah dipublikasikan di Aplikasi.
              </p>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">11. Hukum yang Berlaku</h3>
              <p className="leading-relaxed">
                Syarat ini diatur oleh dan ditafsirkan sesuai dengan hukum yang berlaku di Indonesia.
              </p>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-cyan-400 mb-4">12. Kontak Kami</h3>
              <p className="leading-relaxed">
                Jika Anda memiliki pertanyaan tentang Syarat ini, silakan hubungi kami melalui repository GitHub atau email pengembang.
              </p>
            </section>

            <div className="border-t border-gray-600 pt-6 mt-8">
              <p className="text-sm text-gray-400 text-center">
                Dengan menggunakan Auto Clipper AI, Anda menyetujui Syarat dan Ketentuan Layanan ini.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TermsOfService;

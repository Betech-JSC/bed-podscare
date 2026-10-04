'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { VideoModal } from './components/landing/VideoModal';
import './landing-preview.css';

export function LandingPreview() {
  const [isVideoOpen, setIsVideoOpen] = useState(false);

  return (
    <div className="landing-preview-root min-h-screen">
      {/*  =========================
       NAVBAR
  ==========================  */}

      <header className="navbar">
        <div className="container nav-inner">

          <Link href="/" className="logo">
            <img src="/logo.png" alt="FIXO" className="h-9 w-auto rounded-lg object-contain" />

            <div className="logo-text">
              <strong>FIXO</strong>
              <span>PHẦN MỀM QUẢN LÝ SỬA CHỮA</span>
            </div>
          </Link>

          <nav className="nav-links">
            <a href="#features">Tính năng</a>
            <a href="#industries">Ngành nghề</a>
            <a href="#pricing">Bảng giá</a>
            <a href="#customers">Khách hàng</a>
            <a href="#docs">Tài liệu</a>
            <a href="#contact">Liên hệ</a>
          </nav>

          <div className="nav-actions">
            <Link href="/login" className="btn btn-outline">
              Đăng nhập
            </Link>

            <Link href="/register?plan=trial" className="btn btn-primary">
              Dùng thử miễn phí →
            </Link>
          </div>

        </div>
      </header>


      {/*  =========================
       HERO
  ==========================  */}

      <section className="hero">

        <div className="container hero-grid">

          <div>

            <div className="eyebrow">
              Giải pháp quản lý cửa hàng sửa chữa thiết bị công nghệ
            </div>

            <h1>
              Quản lý cửa hàng sửa chữa{' '}
              <span>dễ dàng, chuyên nghiệp hơn</span>
            </h1>

            <p className="hero-description">
              FIXO giúp bạn quản lý toàn bộ quy trình sửa chữa,
              khách hàng, linh kiện, bảo hành và doanh thu trên
              một nền tảng duy nhất.
            </p>

            <div className="hero-actions">

              <Link href="/register?plan=trial" className="btn btn-primary">
                Dùng thử miễn phí 14 ngày →
              </Link>

              <button className="btn video-btn" onClick={() => setIsVideoOpen(true)}>
                ▶ Xem video giới thiệu
              </button>

            </div>

            <div className="hero-benefits">

              <div className="benefit">
                <div className="benefit-icon">⚡</div>
                <div className="benefit-text">
                  <strong>Dễ sử dụng</strong>
                  <span>Bắt đầu ngay</span>
                </div>
              </div>

              <div className="benefit">
                <div className="benefit-icon">☁</div>
                <div className="benefit-text">
                  <strong>Quản lý mọi lúc</strong>
                  <span>Máy tính, điện thoại</span>
                </div>
              </div>

              <div className="benefit">
                <div className="benefit-icon">✓</div>
                <div className="benefit-text">
                  <strong>An toàn dữ liệu</strong>
                  <span>Sao lưu tự động</span>
                </div>
              </div>

              <div className="benefit">
                <div className="benefit-icon">♧</div>
                <div className="benefit-text">
                  <strong>Hỗ trợ tận tâm</strong>
                  <span>7 ngày/tuần</span>
                </div>
              </div>

            </div>

          </div>


          {/*  DASHBOARD  */}

          <div className="dashboard-wrapper">

            <div className="dashboard">

              <div className="dashboard-top">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>

              <div className="dashboard-content">

                <aside className="sidebar">

                  <div className="sidebar-brand">
                    FIXO
                  </div>

                  <div className="sidebar-item active">
                    ◈ Tổng quan
                  </div>

                  <div className="sidebar-item">
                    ▣ Đơn sửa chữa
                  </div>

                  <div className="sidebar-item">
                    ♙ Khách hàng
                  </div>

                  <div className="sidebar-item">
                    ◉ Sản phẩm
                  </div>

                  <div className="sidebar-item">
                    ◇ Linh kiện
                  </div>

                  <div className="sidebar-item">
                    ✓ Bảo hành
                  </div>

                  <div className="sidebar-item">
                    ₫ Thu chi
                  </div>

                  <div className="sidebar-item">
                    ▥ Báo cáo
                  </div>

                </aside>


                <main className="dashboard-main">

                  <div className="dashboard-title">
                    <h3>Tổng quan</h3>
                    <span className="date">
                      01/10/2026 - 31/10/2026
                    </span>
                  </div>

                  <div className="stats">

                    <div className="stat">
                      <div className="stat-label">
                        Doanh thu
                      </div>
                      <div className="stat-number">
                        24.500.000đ
                      </div>
                      <div className="stat-growth">
                        ↑ 12%
                      </div>
                    </div>

                    <div className="stat">
                      <div className="stat-label">
                        Đơn sửa chữa
                      </div>
                      <div className="stat-number">
                        56
                      </div>
                      <div className="stat-growth">
                        ↑ 20%
                      </div>
                    </div>

                    <div className="stat">
                      <div className="stat-label">
                        Khách hàng mới
                      </div>
                      <div className="stat-number">
                        38
                      </div>
                      <div className="stat-growth">
                        ↑ 15%
                      </div>
                    </div>

                    <div className="stat">
                      <div className="stat-label">
                        Linh kiện tồn
                      </div>
                      <div className="stat-number">
                        320
                      </div>
                      <div className="stat-growth">
                        Cập nhật hôm nay
                      </div>
                    </div>

                  </div>


                  <div className="charts">

                    <div className="chart-card">

                      <div className="chart-title">
                        Doanh thu theo ngày
                      </div>

                      <div className="bars">
                        <div className="bar" style={{ height: "30%" }}></div>
                        <div className="bar" style={{ height: "42%" }}></div>
                        <div className="bar" style={{ height: "38%" }}></div>
                        <div className="bar" style={{ height: "55%" }}></div>
                        <div className="bar" style={{ height: "47%" }}></div>
                        <div className="bar" style={{ height: "65%" }}></div>
                        <div className="bar" style={{ height: "72%" }}></div>
                        <div className="bar" style={{ height: "64%" }}></div>
                        <div className="bar" style={{ height: "83%" }}></div>
                        <div className="bar" style={{ height: "92%" }}></div>
                      </div>

                    </div>


                    <div className="chart-card">

                      <div className="chart-title">
                        Tình trạng đơn hàng
                      </div>

                      <div className="donut"></div>

                    </div>

                  </div>

                </main>

              </div>

            </div>


            {/*  MOBILE APP  */}

            <div className="phone">

              <div className="phone-screen">

                <div className="phone-header">
                  Đơn sửa chữa
                </div>

                <div className="phone-search">
                  Tìm mã đơn, tên khách hàng...
                </div>

                <div className="order">
                  <div className="order-id">
                    #FX0001223
                  </div>

                  <div className="order-name">
                    Nguyễn Văn A
                  </div>

                  <div className="status">
                    Đang xử lý
                  </div>
                </div>

                <div className="order">
                  <div className="order-id">
                    #FX0001222
                  </div>

                  <div className="order-name">
                    Trần Thị B
                  </div>

                  <div className="status">
                    Đã xong
                  </div>
                </div>

                <div className="order">
                  <div className="order-id">
                    #FX0001221
                  </div>

                  <div className="order-name">
                    Lê Minh C
                  </div>

                  <div className="status">
                    Chờ linh kiện
                  </div>
                </div>

              </div>

            </div>

          </div>

        </div>


        {/*  TRUST  */}

        <div className="container">

          <div className="trust-bar">

            <div className="trust-grid">

              <div className="trust-item">
                <div className="trust-number">500+</div>
                <div className="trust-label">
                  Cửa hàng tin dùng
                </div>
              </div>

              <div className="trust-item">
                <div className="trust-number">50.000+</div>
                <div className="trust-label">
                  Đơn sửa chữa mỗi tháng
                </div>
              </div>

              <div className="trust-item">
                <div className="trust-number">100.000+</div>
                <div className="trust-label">
                  Khách hàng được phục vụ
                </div>
              </div>

              <div className="trust-item">
                <div className="trust-number">4.9/5</div>
                <div className="trust-label">
                  Đánh giá từ khách hàng
                </div>
              </div>

            </div>

          </div>

        </div>

      </section>


      {/*  =========================
       FEATURES
  ==========================  */}

      <section className="features" id="features">

        <div className="container">

          <div className="section-heading">

            <div className="section-tag">
              TÍNH NĂNG NỔI BẬT
            </div>

            <h2>
              Tất cả những gì bạn cần
              để vận hành cửa hàng
            </h2>

            <p>
              Không cần sử dụng nhiều phần mềm khác nhau.
              FIXO tập trung toàn bộ hoạt động cửa hàng
              trên một hệ thống duy nhất.
            </p>

          </div>


          <div className="feature-layout">

            <div className="feature-intro">

              <h3>
                Quản lý{' '}
                <span>đơn giản.</span>{' '}
                <br />
                Vận hành{' '}
                <span>hiệu quả.</span>
              </h3>

              <p>
                FIXO được thiết kế riêng cho ngành sửa chữa
                thiết bị công nghệ, giúp bạn tiết kiệm thời
                gian và kiểm soát doanh thu.
              </p>

              <a href="#" className="btn btn-primary">
                Xem tất cả tính năng →
              </a>

            </div>


            <div className="feature-grid">

              <div className="feature-card">
                <div className="feature-icon">▣</div>
                <h4>Quản lý đơn sửa chữa</h4>
                <p>
                  Tạo đơn, theo dõi tiến độ, in phiếu
                  và quản lý trạng thái sửa chữa.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-icon">♙</div>
                <h4>Quản lý khách hàng</h4>
                <p>
                  Lưu thông tin, lịch sử sửa chữa
                  và chăm sóc khách hàng.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-icon">◈</div>
                <h4>Quản lý linh kiện</h4>
                <p>
                  Theo dõi tồn kho, cảnh báo hết hàng
                  và quản lý nhập xuất.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-icon">♧</div>
                <h4>Quản lý bảo hành</h4>
                <p>
                  Tạo phiếu bảo hành, tra cứu nhanh
                  và nhắc hạn bảo hành.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-icon">₫</div>
                <h4>Thu chi & công nợ</h4>
                <p>
                  Quản lý doanh thu, chi phí
                  và công nợ khách hàng.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-icon">▥</div>
                <h4>Báo cáo doanh thu</h4>
                <p>
                  Thống kê theo ngày, tháng,
                  sản phẩm và kỹ thuật viên.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-icon">♙</div>
                <h4>Quản lý nhân viên</h4>
                <p>
                  Phân quyền, theo dõi hiệu suất
                  và kỹ thuật viên.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-icon">⚙</div>
                <h4>Tùy chỉnh linh hoạt</h4>
                <p>
                  Thiết lập dịch vụ, giá và quy trình
                  phù hợp với cửa hàng.
                </p>
              </div>

            </div>

          </div>

        </div>

      </section>


      {/*  =========================
       INDUSTRIES
  ==========================  */}

      <section className="industries" id="industries">

        <div className="container">

          <div className="section-heading">

            <div className="section-tag">
              PHÙ HỢP NHIỀU NGÀNH NGHỀ
            </div>

            <h2>
              Một phần mềm cho mọi
              cửa hàng sửa chữa
            </h2>

            <p>
              FIXO có thể tùy chỉnh cho nhiều mô hình
              sửa chữa thiết bị công nghệ.
            </p>

          </div>


          <div className="industry-grid">

            <div className="industry-card">
              <div className="industry-icon">📱</div>
              <strong>Điện thoại</strong>
              <span>iPhone, Samsung...</span>
            </div>

            <div className="industry-card">
              <div className="industry-icon">💻</div>
              <strong>Laptop</strong>
              <span>MacBook, Windows...</span>
            </div>

            <div className="industry-card">
              <div className="industry-icon">🎧</div>
              <strong>Tai nghe</strong>
              <span>AirPods, Sony...</span>
            </div>

            <div className="industry-card">
              <div className="industry-icon">⌚</div>
              <strong>Đồng hồ</strong>
              <span>Apple Watch...</span>
            </div>

            <div className="industry-card">
              <div className="industry-icon">📲</div>
              <strong>Máy tính bảng</strong>
              <span>iPad...</span>
            </div>

            <div className="industry-card">
              <div className="industry-icon">🔌</div>
              <strong>Phụ kiện</strong>
              <span>Sạc, Cáp...</span>
            </div>

          </div>

        </div>

      </section>


      {/*  =========================
       HOW IT WORKS
  ==========================  */}

      <section className="how">

        <div className="container">

          <div className="section-heading">

            <div className="section-tag">
              BẮT ĐẦU TRONG VÀI PHÚT
            </div>

            <h2>
              Từ lúc tiếp nhận đến khi giao máy
            </h2>

            <p>
              FIXO giúp chuẩn hóa toàn bộ quy trình
              sửa chữa của cửa hàng.
            </p>

          </div>


          <div className="steps">

            <div className="step">
              <div className="step-number">1</div>
              <h3>Tiếp nhận</h3>
              <p>
                Tạo phiếu sửa chữa và lưu thông tin khách hàng.
              </p>
            </div>

            <div className="step">
              <div className="step-number">2</div>
              <h3>Kiểm tra & báo giá</h3>
              <p>
                Kỹ thuật viên kiểm tra thiết bị và cập nhật báo giá.
              </p>
            </div>

            <div className="step">
              <div className="step-number">3</div>
              <h3>Sửa chữa</h3>
              <p>
                Theo dõi linh kiện, kỹ thuật viên và tiến độ.
              </p>
            </div>

            <div className="step">
              <div className="step-number">4</div>
              <h3>Giao máy & bảo hành</h3>
              <p>
                Thanh toán, giao máy và tự động lưu lịch sử bảo hành.
              </p>
            </div>

          </div>

        </div>

      </section>


      {/*  =========================
       PRICING
  ==========================  */}

      <section className="pricing" id="pricing">

        <div className="container">

          <div className="pricing-card">

            <div className="section-tag">
              DÙNG THỬ MIỄN PHÍ
            </div>

            <h2>
              Bắt đầu quản lý cửa hàng
              chuyên nghiệp hơn
            </h2>

            <p>
              Trải nghiệm đầy đủ tính năng FIXO
              trước khi lựa chọn gói phù hợp.
            </p>

            <div className="price">
              0đ{' '}<small>/ 14 ngày</small>
            </div>

            <div className="price-note">
              Không cần thẻ tín dụng
            </div>

            <Link href="/register?plan=trial" className="btn btn-primary">
              Tạo tài khoản miễn phí →
            </Link>

          </div>

        </div>

      </section>


      {/*  =========================
       CTA
  ==========================  */}

      <section className="cta">

        <div className="container">

          <div className="cta-box">

            <h2>
              Sẵn sàng đưa cửa hàng
              lên một hệ thống mới?
            </h2>

            <p>
              Quản lý đơn sửa chữa, khách hàng,
              kho và doanh thu trên FIXO.
            </p>

            <Link href="/register?plan=trial" className="btn btn-primary">
              Dùng thử FIXO miễn phí →
            </Link>

          </div>

        </div>

      </section>


      {/*  =========================
       FOOTER
  ==========================  */}

      <footer id="contact">

        <div className="container">

          <div className="footer-grid">

            <div className="footer-brand">

              <div className="logo">
                <img src="/logo.png" alt="FIXO" className="h-9 w-auto rounded-lg object-contain" />

                <div className="logo-text">
                  <strong style={{ color: "white" }}>
                    FIXO
                  </strong>

                  <span>
                    PHẦN MỀM QUẢN LÝ SỬA CHỮA
                  </span>
                </div>

              </div>

              <p>
                Phần mềm quản lý cửa hàng sửa chữa
                thiết bị công nghệ hàng đầu Việt Nam —
                Một sản phẩm được phát triển bởi Betech Digital.
              </p>

            </div>


            <div className="footer-column">
              <h4>Sản phẩm</h4>
              <a href="#features">Tính năng</a>
              <a href="#pricing">Bảng giá</a>
              <Link href="/register?plan=trial">Dùng thử</Link>
              <Link href="/login">Đăng nhập</Link>
            </div>


            <div className="footer-column">
              <h4>Hỗ trợ</h4>
              <a href="#">Trung tâm trợ giúp</a>
              <a href="#">Tài liệu</a>
              <a href="#">Hướng dẫn sử dụng</a>
              <a href="#">Liên hệ</a>
            </div>


            <div className="footer-column">
              <h4>Công ty</h4>
              <a href="#">Về FIXO</a>
              <a href="#">Khách hàng</a>
              <a href="#">Điều khoản</a>
              <a href="#">Chính sách bảo mật</a>
            </div>

          </div>


          <div className="copyright">
            © 2026 FIXO. Sản phẩm được phát triển bởi Betech Digital.
          </div>

        </div>

      </footer>
      <VideoModal isOpen={isVideoOpen} onClose={() => setIsVideoOpen(false)} />
    </div>
  );
}

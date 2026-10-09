# Life & Money — Firebase Hosting + Authentication + Firestore

Ứng dụng web responsive bằng HTML/CSS/JavaScript, với Google Authentication và đồng bộ dữ liệu qua Cloud Firestore. Ngày âm lịch được tính ở trình duyệt bằng thuật toán lịch âm Việt Nam; các giao dịch, công việc, sự kiện và mục tiêu được đồng bộ theo UID tài khoản.

## 1. Chuẩn bị dự án Firebase

1. Mở https://console.firebase.google.com/ và chọn dự án của bạn.
2. Trong **Project settings → General → Your apps**, thêm ứng dụng Web (biểu tượng `</>`), nếu chưa có.
3. Sao chép đối tượng `firebaseConfig` mà Firebase cung cấp.
4. Mở `public/app.js`, thay các giá trị `PASTE_...` trong `firebaseConfig` bằng giá trị thật. Không dán file cấu hình Admin SDK hoặc private key vào frontend. Firebase Web API key thường được nhúng trong ứng dụng; bảo vệ dữ liệu bằng Authentication, Firestore Rules và giới hạn API key theo hướng dẫn Google.
5. Vào **Authentication → Get started → Sign-in method**, bật **Google**.
6. Trong Authentication → Settings → Authorized domains, xác nhận domain triển khai của bạn có trong danh sách. Thêm domain riêng nếu cần.
7. Vào **Firestore Database → Create database**. Chọn vị trí gần người dùng, lưu ý vị trí database không thể đổi dễ dàng sau khi tạo.

## 2. Cấu hình quyền Firestore

File `firestore.rules` giới hạn đọc/ghi vào `users/{UID}/app/data` cho đúng người dùng đang đăng nhập. Các đường dẫn khác bị từ chối mặc định.

- Mở **Firestore Database → Rules**, dán nội dung file `firestore.rules`, nhấn **Publish**.
- Không dùng quy tắc phát triển kiểu `allow read, write: if true;`.
- Quy tắc này ngăn tài khoản A đọc/ghi tài liệu thuộc UID tài khoản B.
- Nếu sau này thay đổi cấu trúc dữ liệu, cập nhật rules và kiểm thử lại. Không thêm dữ liệu nhạy cảm không cần thiết vào tài liệu.
- Cấu trúc dữ liệu hiện tại là một tài liệu `users/{uid}/app/data` chứa mảng giao dịch, mảng công việc và cài đặt. Phù hợp với sổ cá nhân nhỏ; khi dữ liệu lớn, nên chuyển mỗi giao dịch/công việc thành tài liệu riêng để tránh giới hạn 1 MiB mỗi tài liệu.

## 3. Cài Firebase CLI và xuất bản

Cần Node.js bản LTS được cài trên máy tính. Mở Terminal / PowerShell trong thư mục dự án.

```bash
npm install -g firebase-tools
firebase login
```

Đăng nhập tài khoản Google có quyền với dự án. Trong thư mục này, chạy:

```bash
firebase use --add
```

Chọn dự án Firebase hiện có và đặt alias `default`. Hoặc sao chép `.firebaserc.example` thành `.firebaserc` rồi thay `YOUR_FIREBASE_PROJECT_ID` bằng Project ID thật.

Triển khai rules và website:

```bash
firebase deploy --only firestore:rules,hosting
```

Sau khi hoàn tất, CLI hiển thị URL Hosting, thường có dạng `https://YOUR_PROJECT_ID.web.app`. Mở URL trên điện thoại và đăng nhập cùng tài khoản Google để thấy dữ liệu được đồng bộ.

## 4. Kiểm tra sau triển khai

- Đăng nhập bằng Google trên điện thoại và máy tính.
- Thêm một giao dịch hoặc công việc; kiểm tra nó xuất hiện trên thiết bị còn lại.
- Thử đăng xuất rồi đăng nhập lại.
- Với tài khoản thứ hai, xác nhận dữ liệu của tài khoản thứ nhất không thể đọc được.
- Nếu Google sign-in lỗi, kiểm tra Authentication đã bật Google, Authorized domains, URL Hosting và cấu hình `firebaseConfig`.
- Nếu Firestore báo `permission-denied`, kiểm tra rules đã Publish và đường dẫn UID có đúng.

## 5. Dùng như ứng dụng trên điện thoại

Mở URL Hosting trong Chrome/Safari và chọn **Add to Home Screen / Thêm vào màn hình chính**. Bản hiện tại là web app responsive; cài đặt PWA nâng cao và thông báo đẩy chưa được cấu hình.

## Ghi chú dữ liệu

- Bản mẫu không nhập dữ liệu localStorage từ prototype trước đó. Nếu có dữ liệu cũ cần giữ, hãy xuất bản sao lưu và thực hiện chuyển đổi/import sau khi xác nhận định dạng.
- Firestore đồng bộ dữ liệu qua mạng. Bản này không triển khai hàng đợi ghi ngoại tuyến tùy chỉnh.
- Firebase có thể yêu cầu thiết lập thanh toán hoặc giới hạn tài nguyên tùy dịch vụ và mức sử dụng. Kiểm tra bảng giá và mức sử dụng trong Firebase Console.

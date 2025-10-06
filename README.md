# React Hand Gesture Control

A powerful and intuitive React library that transforms web navigation through hand gesture recognition. Effortlessly scroll, swipe between pages, click elements, and take section or full page screenshots using simple hand gestures, eliminating the need for a mouse or keyboard. Enhance your web applications with smooth, hands-free control and modern gesture-driven interaction.

---

## ✅ Installation

```bash
npm install hand-gesture-controller
```

## ✅ Supported Gestures

- ☝️ **Index finger only** → Move cursor + scroll
- ☝️ **Hold cursor on clickable element (1.5s)** → Click/Tap
- ✌️ **Two fingers - Index and middle** → Scroll down
- 🖐 **Four fingers pointing at the screen** → Swipe (Next / Previous)
- ✊ **Fist (hold 2.5s)** → Screenshot
- 🖐 **Palm (hold 2.5s)** → Full Page Screenshot

## ✅ Features

- 🎯 **Precision Cursor Control** - Navigate with your index finger
- 👆 **Smart Click Detection** - Automatically detects clickable elements (buttons, links, React components with onClick handlers)
- 📜 **Gesture-Based Scrolling** - Intuitive up/down scrolling
- 🔄 **Page Navigation** - Swipe to go forward/backward
- 📸 **Screenshot Capabilities** - Capture viewport or full page
- ⚡ **Framework Agnostic** - Works with React, Next.js

## ✅ Usage Example

```js
import "./globals.css";
import HandGestureController from "hand-gesture-controller";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode,
}>) {
  return (
    <html lang="en">
      <body>
        <HandGestureController />
        {children}
      </body>
    </html>
  );
}
```

## ✅ Requirements

- **React 18+**
- **Modern browser with camera/webcam support**

## 📝 License

- **MIT**

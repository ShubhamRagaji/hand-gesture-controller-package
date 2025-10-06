# React Hand Gesture Control

A powerful and intuitive React library that transforms web navigation through hand gesture recognition. Effortlessly scroll, swipe between pages, click elements, and take section or full page screenshots using simple hand gestures, eliminating the need for a mouse or keyboard. Enhance your web applications with smooth, hands-free control and modern gesture-driven interaction.

---

## ✅ Installation

```bash
npm install hand-gesture-controller
```

## ✅ Supported Gestures

☝️ **Index finger only**

- Move your index finger up or down in front of the camera to scroll the page vertically — just like using a mouse wheel or trackpad.

☝️ **Hold cursor on clickable element (1.5s)**

- Hold your index finger steady over a clickable element (like a button or link) for about 1.5 seconds to perform a click/tap action.

✌️ **Two fingers - Index and middle**

- When you show two fingers, move them up or down to scroll the page — this provides a smoother and faster scroll compared to the single-finger gesture.

🖐 **Four fingers pointing at the screen**

- Extend four fingers toward the camera to activate the swipe gesture.
- Move your hand left or right to navigate between pages, for example:
  - Swipe left → right for Previous Page
  - Swipe right → left for Next Page

✊ **Fist (hold 2.5s)**

- Make a fist and hold it steady for about 2.5 seconds.
- This triggers a screenshot of the visible part of your screen.

🖐 **Palm (hold 2.5s)**

- Show your open palm (all five fingers extended) and hold for 2.5 seconds.
- This takes a full-page screenshot, capturing the entire scrollable area of the page.

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
import { HandGestureController } from "hand-gesture-controller";

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

"use client";
import { useEffect, useRef } from "react";
import {
  HandLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";
import { domToPng } from "modern-screenshot";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";

export function useHandGestures() {
  // Refs for video and canvas
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const router = useRouter();

  // Hand landmark model instance
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);

  // Flag to prevent re-initializing model multiple times
  const initializedRef = useRef(false);

  // Store last positions for comparing movements
  const lastYRef = useRef<number | null>(null);
  const lastXRef = useRef<number | null>(null);

  // Prevents repeated actions (cooldown between gestures)
  const lastActionRef = useRef<number>(0);

  // History of positions (for smoothing gesture detection)
  const historyYRef = useRef<number[]>([]);
  const historyXRef = useRef<number[]>([]);
  const HISTORY_MAX = 5; // max length of history
  const COOLDOWN = 500; // ms between actions (0.5s)

  // ---------------- Screenshot logic ----------------
  const fistHoldStartRef = useRef<number | null>(null);
  const screenshotTakenRef = useRef<boolean>(false);
  const FIST_HOLD_TIME = 2500;

  // ---------------- Palm screenshot logic ----------------
  const palmHoldStartRef = useRef<number | null>(null);
  const palmScreenshotTakenRef = useRef<boolean>(false);
  const PALM_HOLD_TIME = 2500;

  // ---------------- Click logic ----------------
  const clickHoldStartRef = useRef<number | null>(null);
  const clickExecutedRef = useRef<boolean>(false);
  const currentElementRef = useRef<Element | null>(null);
  const CLICK_HOLD_TIME = 1500;
  const clickProgressRef = useRef<HTMLDivElement | null>(null);

  // ---------------- Cursor control logic ----------------
  const smoothingBufferRef = useRef<{ x: number[]; y: number[] }>({
    x: [],
    y: [],
  });
  const SMOOTHING_BUFFER_SIZE = 10;
  const cursorElementRef = useRef<HTMLDivElement | null>(null);
  const CURSOR_SENSITIVITY = 4;

  // Helper to add new value into history (keeps max length)
  function pushHistory(hist: number[], value: number) {
    hist.push(value);
    if (hist.length > HISTORY_MAX) hist.shift();
  }

  // Helper for smoothing cursor movement
  function addToSmoothingBuffer(x: number, y: number) {
    smoothingBufferRef.current.x.push(x);
    smoothingBufferRef.current.y.push(y);

    if (smoothingBufferRef.current.x.length > SMOOTHING_BUFFER_SIZE) {
      smoothingBufferRef.current.x.shift();
    }
    if (smoothingBufferRef.current.y.length > SMOOTHING_BUFFER_SIZE) {
      smoothingBufferRef.current.y.shift();
    }
  }

  function getSmoothedPosition() {
    const xSum = smoothingBufferRef.current.x.reduce(
      (sum, val) => sum + val,
      0
    );
    const ySum = smoothingBufferRef.current.y.reduce(
      (sum, val) => sum + val,
      0
    );

    return {
      x: xSum / smoothingBufferRef.current.x.length,
      y: ySum / smoothingBufferRef.current.y.length,
    };
  }

  // Helper to check if element is clickable
  // Helper to check if element is clickable
  function isElementClickable(element: Element): boolean {
    if (!element) return false;

    const tagName = element.tagName.toLowerCase();
    const styles = window.getComputedStyle(element);

    // 1. Check naturally clickable HTML tags
    const clickableTags = [
      "a",
      "button",
      "input",
      "select",
      "textarea",
      "label",
      "summary",
      "details",
    ];
    if (clickableTags.includes(tagName)) return true;

    // 2. Check for ANY onclick-related attributes (works on any element)
    if (element.hasAttribute("onclick")) return true;

    // 3. Check for ALL event handler attributes (on*, @, (), etc.)
    const hasEventHandler = Array.from(element.attributes).some((attr) => {
      const name = attr.name.toLowerCase();
      return (
        name.startsWith("on") || // onclick, onmousedown, onpointerdown, etc.
        name.startsWith("@") || // Vue: @click
        name.startsWith("(") || // Angular: (click)
        name.includes(":click") || // Vue shorthand: v-on:click
        name.includes("v-on") // Vue: v-on:click
      );
    });
    if (hasEventHandler) return true;

    // 4. Check cursor style (strong indicator of clickability)
    if (styles.cursor === "pointer") return true;

    // 5. Check ARIA roles for interactive elements
    const role = element.getAttribute("role");
    const interactiveRoles = [
      "button",
      "link",
      "menuitem",
      "menuitemcheckbox",
      "menuitemradio",
      "option",
      "tab",
      "checkbox",
      "radio",
      "switch",
      "slider",
      "spinbutton",
      "textbox",
      "combobox",
      "gridcell",
      "treeitem",
    ];
    if (role && interactiveRoles.includes(role)) return true;

    // 6. Check tabindex (focusable elements are often interactive)
    const tabindex = element.getAttribute("tabindex");
    if (tabindex !== null && parseInt(tabindex) >= 0) return true;

    // 7. Check for data attributes suggesting interactivity
    const hasInteractiveDataAttr = Array.from(element.attributes).some(
      (attr) => {
        const name = attr.name.toLowerCase();
        return (
          name.startsWith("data-") &&
          (name.includes("click") ||
            name.includes("action") ||
            name.includes("handler") ||
            name.includes("toggle") ||
            name.includes("trigger") ||
            name.includes("interact"))
        );
      }
    );
    if (hasInteractiveDataAttr) return true;

    // 8. Check for contenteditable (editable areas are interactive)
    if (element.hasAttribute("contenteditable")) return true;

    // 9. Check for interactive-looking class names
    const className = element.className;
    if (typeof className === "string") {
      const interactiveClassPatterns = [
        "btn",
        "button",
        "click",
        "link",
        "interactive",
        "action",
        "menu",
        "tab",
        "toggle",
        "card",
        "tile",
        "item",
        "trigger",
        "handle",
      ];
      const lowerClassName = className.toLowerCase();
      if (
        interactiveClassPatterns.some((pattern) =>
          lowerClassName.includes(pattern)
        )
      ) {
        return true;
      }
    }

    // 10. Deep check for React event listeners (React Fiber)
    // React attaches event listeners via its internal fiber structure
    const elementKeys = Object.keys(element);

    // Check React Props first (most reliable)
    const propsKey = elementKeys.find((key) => key.startsWith("__reactProps"));
    if (propsKey) {
      try {
        const props = (element as any)[propsKey];
        if (props && (props.onClick || props.onClickCapture)) {
          return true;
        }
      } catch (e) {
        // Silently fail if we can't access React internals
      }
    }

    // Check React Fiber memoizedProps
    const fiberKey = elementKeys.find((key) => key.startsWith("__reactFiber"));
    if (fiberKey) {
      try {
        const fiber = (element as any)[fiberKey];
        if (
          fiber &&
          fiber.memoizedProps &&
          (fiber.memoizedProps.onClick || fiber.memoizedProps.onClickCapture)
        ) {
          return true;
        }
      } catch (e) {
        // Silently fail if we can't access React internals
      }
    }

    // 11. Check for Vue event listeners
    const vueKey = elementKeys.find((key) => key.startsWith("__vue"));
    if (vueKey) {
      try {
        const vueInstance = (element as any)[vueKey];
        if (vueInstance && vueInstance.onClick) {
          return true;
        }
      } catch (e) {
        // Silently fail
      }
    }

    // 12. Check if element has any event listeners at all (browser API)
    // This checks the browser's internal event listener registry
    if (typeof (window as any).getEventListeners === "function") {
      try {
        const listeners = (window as any).getEventListeners(element);
        if (listeners && (listeners.click || listeners.mousedown)) {
          return true;
        }
      } catch (e) {
        // Not available in all browsers
      }
    }

    // 14. Final check: elements with pointer-events enabled + visual cues
    if (styles.pointerEvents !== "none") {
      // Has transform/transition effects (often used for interactive elements)
      const hasVisualEffects =
        styles.transition.includes("transform") ||
        styles.transition.includes("opacity") ||
        styles.transition.includes("background") ||
        styles.transform !== "none";

      if (hasVisualEffects && className && typeof className === "string") {
        return true;
      }
    }

    return false;
  }

  // Create click progress indicator
  useEffect(() => {
    const progressIndicator = document.createElement("div");
    progressIndicator.id = "click-progress-indicator";
    progressIndicator.style.cssText = `
      position: fixed;
      width: 32px;
      height: 32px;
      border: 3px solid white;
      border-radius: 50%;
      pointer-events: none;
      z-index: 10001;
      display: none;
      transform: translate(-50%, -50%);
      box-shadow: 0 0 10px rgba(255, 0, 0, 0.5);
    `;
    document.body.appendChild(progressIndicator);
    clickProgressRef.current = progressIndicator;

    return () => {
      if (clickProgressRef.current) {
        document.body.removeChild(clickProgressRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let animationId: number;

    // Target the existing cursor element
    const cursorElement = document.getElementById("custom-cursor");
    if (cursorElement && cursorElement instanceof HTMLDivElement) {
      cursorElementRef.current = cursorElement;
    }

    // ---------------- INIT ----------------
    async function init() {
      if (initializedRef.current) return;
      initializedRef.current = true;

      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
        );

        handLandmarkerRef.current = await HandLandmarker.createFromOptions(
          vision,
          {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-assets/hand_landmarker.task",
            },
            runningMode: "VIDEO",
            numHands: 1,
          }
        );

        if (!videoRef.current) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
        });

        const loadingToastId = toast.info(
          "Initializing hand gesture detection...",
          { autoClose: false, closeOnClick: false }
        );

        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = () => {
          setTimeout(() => {
            toast.dismiss(loadingToastId);
          }, 1000);

          toast.success(
            "Camera initialized! Hand gesture detection is now active.",
            {
              autoClose: 3000,
              onClose: () => {
                toast.info(
                  <div>
                    <div className="pb-2">
                      ☝️ Index finger only: Move cursor + scroll
                    </div>
                    <div className="pb-2">
                      ☝️ Hold cursor on clickable element (1.5s): Click
                    </div>
                    <div className="pb-2">✌️ Two fingers: Scroll down</div>
                    <div className="pb-2">🖐 Four fingers: Swipe</div>
                    <div className="pb-2">✊ Fist (hold 2.5s): Screenshot</div>
                    <div className="pb-2">
                      🖐 Palm (hold 2.5s): Full page screenshot
                    </div>
                  </div>,
                  {
                    autoClose: 8000,
                    pauseOnHover: true,
                  }
                );
              },
            }
          );

          loop();
        };
      } catch (error) {
        console.error("Failed to initialize hand tracking:", error);
      }
    }

    // ---------------- LOOP ----------------
    async function loop() {
      if (
        !handLandmarkerRef.current ||
        !videoRef.current ||
        !canvasRef.current
      ) {
        animationId = requestAnimationFrame(loop);
        return;
      }

      try {
        const results = await handLandmarkerRef.current.detectForVideo(
          videoRef.current,
          performance.now()
        );

        const ctx = canvasRef.current.getContext("2d")!;
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        if (results.landmarks && results.landmarks.length > 0) {
          const lm = results.landmarks[0];

          const drawingUtils = new DrawingUtils(ctx);
          drawingUtils.drawConnectors(lm, HandLandmarker.HAND_CONNECTIONS, {
            color: "lime",
            lineWidth: 2,
          });
          drawingUtils.drawLandmarks(lm, { color: "red", radius: 4 });

          processGestures(lm);
        } else {
          if (cursorElementRef.current) {
            cursorElementRef.current.style.display = "none";
          }
          if (clickProgressRef.current) {
            clickProgressRef.current.style.display = "none";
          }
          fistHoldStartRef.current = null;
          screenshotTakenRef.current = false;
          palmHoldStartRef.current = null;
          palmScreenshotTakenRef.current = false;
          clickHoldStartRef.current = null;
          clickExecutedRef.current = false;
          currentElementRef.current = null;
          smoothingBufferRef.current = { x: [], y: [] };
        }
      } catch (error) {
        console.error("Error in detection loop:", error);
      }

      animationId = requestAnimationFrame(loop);
    }

    // ---------------- GESTURE LOGIC ----------------
    function processGestures(lm: any) {
      const indexTip = lm[8];
      const middleTip = lm[12];
      const ringTip = lm[16];
      const pinkyTip = lm[20];
      const thumbTip = lm[4];

      const indexMCP = lm[5];
      const middleMCP = lm[9];
      const ringMCP = lm[13];
      const pinkyMCP = lm[17];
      const thumbMCP = lm[2];

      const isIndexUp = indexTip.y < indexMCP.y;
      const isMiddleUp = middleTip.y < middleMCP.y;
      const isRingUp = ringTip.y < ringMCP.y;
      const isPinkyUp = pinkyTip.y < pinkyMCP.y;
      const isThumbUp =
        Math.abs(thumbTip.x - thumbMCP.x) > 0.08 ||
        Math.abs(thumbTip.y - thumbMCP.y) > 0.08;

      const isFist = isFistGesture(lm);
      const isPalm = isPalmGesture(lm);

      // ☝ One finger (index only) → Scroll + cursor movement + click
      if (isIndexUp && !isMiddleUp && !isRingUp && !isPinkyUp) {
        handleVerticalScroll(lm, { isIndexUp, isMiddleUp: false });
        handleCursorMovement(lm);
        handleClickGesture();
        fistHoldStartRef.current = null;
        screenshotTakenRef.current = false;
        palmHoldStartRef.current = null;
        palmScreenshotTakenRef.current = false;
      }
      // ✌ Two fingers (index + middle) → Scroll down
      else if (isIndexUp && isMiddleUp && !isRingUp && !isPinkyUp) {
        if (cursorElementRef.current) {
          cursorElementRef.current.style.display = "none";
        }
        if (clickProgressRef.current) {
          clickProgressRef.current.style.display = "none";
        }
        handleVerticalScroll(lm, { isIndexUp, isMiddleUp: true });
        resetClickState();
        fistHoldStartRef.current = null;
        screenshotTakenRef.current = false;
        palmHoldStartRef.current = null;
        palmScreenshotTakenRef.current = false;
      }
      // 🖐 Four fingers (NOT thumb) → Horizontal swipe
      else if (isIndexUp && isMiddleUp && isRingUp && isPinkyUp && !isThumbUp) {
        if (cursorElementRef.current) {
          cursorElementRef.current.style.display = "none";
        }
        if (clickProgressRef.current) {
          clickProgressRef.current.style.display = "none";
        }
        handleHorizontalSwipe(lm);
        resetClickState();
        fistHoldStartRef.current = null;
        screenshotTakenRef.current = false;
        palmHoldStartRef.current = null;
        palmScreenshotTakenRef.current = false;
      }
      // 🖐 Palm (all 5 fingers including thumb) → Full page screenshot
      else if (isPalm && isThumbUp) {
        if (cursorElementRef.current) {
          cursorElementRef.current.style.display = "none";
        }
        if (clickProgressRef.current) {
          clickProgressRef.current.style.display = "none";
        }
        resetClickState();

        if (palmScreenshotTakenRef.current) {
          return;
        }

        if (!palmHoldStartRef.current) {
          palmHoldStartRef.current = Date.now();
        } else {
          const holdTime = Date.now() - palmHoldStartRef.current;

          if (holdTime >= PALM_HOLD_TIME) {
            const captureScreenshot = toast.info(
              "Taking full page screenshot..."
            );
            handleFullPageScreenshot(captureScreenshot);
            palmScreenshotTakenRef.current = true;
          }
        }
      }
      // ✊ Fist → screenshot after 2.5s hold
      else if (isFist) {
        if (cursorElementRef.current) {
          cursorElementRef.current.style.display = "none";
        }
        if (clickProgressRef.current) {
          clickProgressRef.current.style.display = "none";
        }
        resetClickState();

        if (screenshotTakenRef.current) {
          return;
        }

        if (!fistHoldStartRef.current) {
          fistHoldStartRef.current = Date.now();
        } else {
          const holdTime = Date.now() - fistHoldStartRef.current;

          if (holdTime >= FIST_HOLD_TIME) {
            const captureScreenshot = toast.info("Taking screenshot...");
            handleScreenshot(captureScreenshot);
            screenshotTakenRef.current = true;
          }
        }
        palmHoldStartRef.current = null;
        palmScreenshotTakenRef.current = false;
      }
      // ❌ No valid gesture → reset states
      else {
        if (cursorElementRef.current) {
          cursorElementRef.current.style.display = "none";
        }
        if (clickProgressRef.current) {
          clickProgressRef.current.style.display = "none";
        }
        lastYRef.current = null;
        lastXRef.current = null;
        historyYRef.current = [];
        historyXRef.current = [];
        resetClickState();
        fistHoldStartRef.current = null;
        screenshotTakenRef.current = false;
        palmHoldStartRef.current = null;
        palmScreenshotTakenRef.current = false;
      }
    }

    // ---------------- CLICK GESTURE ----------------
    function handleClickGesture() {
      if (!cursorElementRef.current || !clickProgressRef.current) return;

      const smoothed = getSmoothedPosition();
      const elementUnderCursor = document.elementFromPoint(
        smoothed.x,
        smoothed.y
      );

      if (
        !elementUnderCursor ||
        elementUnderCursor === cursorElementRef.current
      ) {
        resetClickState();
        return;
      }

      // Check if element or any parent is clickable
      let clickableElement: Element | null = null;
      let current: Element | null = elementUnderCursor;

      while (current && current !== document.body) {
        if (isElementClickable(current)) {
          clickableElement = current;
          break;
        }
        current = current.parentElement;
      }

      if (!clickableElement) {
        resetClickState();
        return;
      }

      // If we moved to a different element, reset
      if (currentElementRef.current !== clickableElement) {
        currentElementRef.current = clickableElement;
        clickHoldStartRef.current = Date.now();
        clickExecutedRef.current = false;

        // Show progress indicator
        clickProgressRef.current.style.display = "block";
        clickProgressRef.current.style.left = `${smoothed.x}px`;
        clickProgressRef.current.style.top = `${smoothed.y}px`;
      }

      // Update progress indicator position
      clickProgressRef.current.style.left = `${smoothed.x}px`;
      clickProgressRef.current.style.top = `${smoothed.y}px`;

      if (clickHoldStartRef.current && !clickExecutedRef.current) {
        const holdTime = Date.now() - clickHoldStartRef.current;
        const progress = Math.min(holdTime / CLICK_HOLD_TIME, 1);

        // Update progress indicator
        const angle = progress * 360;
        clickProgressRef.current.style.background = `conic-gradient(
          rgb(0, 0, 0) ${angle}deg,
          transparent ${angle}deg
        )`;

        if (holdTime >= CLICK_HOLD_TIME) {
          executeClick(clickableElement, smoothed.x, smoothed.y);
          clickExecutedRef.current = true;

          // Flash effect
          clickProgressRef.current.style.background = "rgb(34, 197, 94)";
          setTimeout(() => {
            resetClickState();
          }, 200);
        }
      }
    }

    function executeClick(element: Element, x: number, y: number) {
      console.log("Executing click on:", element);

      // Create and dispatch mouse events
      const mousedownEvent = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
      });

      const mouseupEvent = new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
      });

      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
      });

      element.dispatchEvent(mousedownEvent);
      element.dispatchEvent(mouseupEvent);
      element.dispatchEvent(clickEvent);

      // Visual feedback
      toast.success("Click executed!", { autoClose: 1000 });
    }

    function resetClickState() {
      clickHoldStartRef.current = null;
      clickExecutedRef.current = false;
      currentElementRef.current = null;

      if (clickProgressRef.current) {
        clickProgressRef.current.style.display = "none";
        clickProgressRef.current.style.background = "";
      }
    }

    // ---------------- CURSOR MOVEMENT ----------------
    function handleCursorMovement(lm: any) {
      const indexTip = lm[8];

      let normalizedX = 1 - indexTip.x;
      let normalizedY = indexTip.y;

      const centerX = 0.5;
      const centerY = 0.5;

      const deltaX = (normalizedX - centerX) * CURSOR_SENSITIVITY;
      const deltaY = (normalizedY - centerY) * CURSOR_SENSITIVITY;

      const screenX = Math.max(
        0,
        Math.min(window.innerWidth - 1, (centerX + deltaX) * window.innerWidth)
      );
      const screenY = Math.max(
        0,
        Math.min(
          window.innerHeight - 1,
          (centerY + deltaY) * window.innerHeight
        )
      );

      addToSmoothingBuffer(screenX, screenY);

      const smoothed = getSmoothedPosition();

      if (cursorElementRef.current) {
        cursorElementRef.current.style.display = "block";
        cursorElementRef.current.style.left = `${smoothed.x - 8}px`;
        cursorElementRef.current.style.top = `${smoothed.y - 8}px`;
      }
    }

    // ---------------- VERTICAL SCROLL ----------------
    function handleVerticalScroll(
      lm: any,
      { isIndexUp, isMiddleUp }: { isIndexUp: boolean; isMiddleUp: boolean }
    ) {
      const indexTip = lm[8];
      const middleTip = lm[12];

      let avgY: number | null = null;
      if (isIndexUp && isMiddleUp) avgY = (indexTip.y + middleTip.y) / 2;
      else if (isIndexUp) avgY = indexTip.y;

      if (avgY === null) {
        lastYRef.current = null;
        historyYRef.current = [];
        return;
      }

      pushHistory(historyYRef.current, avgY);

      const lastY = lastYRef.current;
      const now = Date.now();
      const threshold = 0.02;

      if (lastY !== null && now - lastActionRef.current > COOLDOWN) {
        const deltaY = avgY - lastY;

        if (isIndexUp && isMiddleUp && deltaY < -threshold) {
          window.scrollBy({ top: 500, behavior: "smooth" });
          lastActionRef.current = now;
          historyYRef.current = [];
          resetClickState();
        } else if (isIndexUp && !isMiddleUp && deltaY > threshold) {
          window.scrollBy({ top: -500, behavior: "smooth" });
          lastActionRef.current = now;
          historyYRef.current = [];
          resetClickState();
        }
      }

      lastYRef.current = avgY;
    }

    // ---------------- HORIZONTAL SWIPE ----------------
    function handleHorizontalSwipe(lm: any) {
      const indexTip = lm[8];
      const xNorm = 1 - indexTip.x;

      pushHistory(historyXRef.current, xNorm);

      const lastPos =
        historyXRef.current.length > 1
          ? historyXRef.current[historyXRef.current.length - 2]
          : null;
      const now = Date.now();
      const horizontalThreshold = 0.16;

      if (lastPos !== null && now - lastActionRef.current > COOLDOWN) {
        const dx = xNorm - lastPos;

        if (Math.abs(dx) > horizontalThreshold) {
          if (dx > 0) router.back();
          else router.forward();

          lastActionRef.current = now;
          historyXRef.current = [];
        }
      }
    }

    // ---------------- SCREENSHOT ----------------
    async function handleScreenshot(captureScreenshot: any) {
      try {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (video) video.style.visibility = "hidden";
        if (canvas) canvas.style.visibility = "hidden";
        if (cursorElementRef.current)
          cursorElementRef.current.style.display = "none";
        if (clickProgressRef.current)
          clickProgressRef.current.style.display = "none";

        await new Promise((resolve) => setTimeout(resolve, 100));

        const scrollX =
          window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY =
          window.pageYOffset || document.documentElement.scrollTop;

        const dataUrl = await domToPng(document.body, {
          width: window.innerWidth,
          height: window.innerHeight,
          backgroundColor: "#ffffff",
          scale: 1,
          style: {
            transform: `translate(-${scrollX}px, -${scrollY}px)`,
            transformOrigin: "top left",
          },
          filter: (node) => {
            if (
              node === video ||
              node === canvas ||
              node === cursorElementRef.current ||
              node === clickProgressRef.current
            )
              return false;

            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;

              if (
                ["VIDEO", "CANVAS", "SCRIPT", "STYLE"].includes(element.tagName)
              ) {
                return false;
              }

              if (element.classList?.contains("Toastify__toast-container")) {
                return false;
              }
            }

            return true;
          },
        });

        const link = document.createElement("a");
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        link.download = `screenshot-${timestamp}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.dismiss(captureScreenshot);
        toast.success("Screenshot saved successfully!");

        if (video) video.style.visibility = "visible";
        if (canvas) canvas.style.visibility = "visible";
      } catch (err) {
        console.error("Screenshot failed:", err);

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video) video.style.visibility = "visible";
        if (canvas) canvas.style.visibility = "visible";

        toast.dismiss(captureScreenshot);
        toast.error("Screenshot failed. Please try again.");
      }
    }

    // ---------------- FULL PAGE SCREENSHOT ----------------
    async function handleFullPageScreenshot(captureScreenshot: any) {
      try {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (video) video.style.visibility = "hidden";
        if (canvas) canvas.style.visibility = "hidden";
        if (cursorElementRef.current)
          cursorElementRef.current.style.display = "none";
        if (clickProgressRef.current)
          clickProgressRef.current.style.display = "none";

        await new Promise((resolve) => setTimeout(resolve, 100));

        const dataUrl = await domToPng(document.body, {
          width: document.body.scrollWidth,
          height: document.body.scrollHeight,
          style: { margin: "0", padding: "0" },
          backgroundColor: "#ffffff",
          scale: 1,
          filter: (node) => {
            if (
              node === video ||
              node === canvas ||
              node === cursorElementRef.current ||
              node === clickProgressRef.current
            )
              return false;

            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;

              if (
                ["VIDEO", "CANVAS", "SCRIPT", "STYLE"].includes(element.tagName)
              ) {
                return false;
              }

              if (element.classList?.contains("Toastify__toast-container")) {
                return false;
              }
            }

            return true;
          },
        });

        const link = document.createElement("a");
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        link.download = `fullpage-screenshot-${timestamp}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.dismiss(captureScreenshot);
        toast.success("Full page screenshot saved successfully!");

        if (video) video.style.visibility = "visible";
        if (canvas) canvas.style.visibility = "visible";
      } catch (err) {
        console.error("Full page screenshot failed:", err);

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video) video.style.visibility = "visible";
        if (canvas) canvas.style.visibility = "visible";

        toast.dismiss(captureScreenshot);
        toast.error("Full page screenshot failed. Please try again.");
      }
    }

    function isFistGesture(lm: any) {
      function fingerFolded(tipIndex: number, mcpIndex: number) {
        const tip = lm[tipIndex];
        const mcp = lm[mcpIndex];
        const dist = Math.hypot(tip.x - mcp.x, tip.y - mcp.y);
        return dist < 0.1;
      }

      const indexFolded = fingerFolded(8, 5);
      const middleFolded = fingerFolded(12, 9);
      const ringFolded = fingerFolded(16, 13);
      const pinkyFolded = fingerFolded(20, 17);

      return indexFolded && middleFolded && ringFolded && pinkyFolded;
    }

    function isPalmGesture(lm: any) {
      const thumbTip = lm[4];
      const indexTip = lm[8];
      const middleTip = lm[12];
      const ringTip = lm[16];
      const pinkyTip = lm[20];

      const thumbMCP = lm[2];
      const indexMCP = lm[5];
      const middleMCP = lm[9];
      const ringMCP = lm[13];
      const pinkyMCP = lm[17];

      const isThumbExtended =
        Math.abs(thumbTip.x - thumbMCP.x) > 0.08 ||
        Math.abs(thumbTip.y - thumbMCP.y) > 0.08;
      const isIndexExtended = indexTip.y < indexMCP.y - 0.05;
      const isMiddleExtended = middleTip.y < middleMCP.y - 0.05;
      const isRingExtended = ringTip.y < ringMCP.y - 0.05;
      const isPinkyExtended = pinkyTip.y < pinkyMCP.y - 0.05;

      return (
        isThumbExtended &&
        isIndexExtended &&
        isMiddleExtended &&
        isRingExtended &&
        isPinkyExtended
      );
    }

    if (cursorElementRef.current) {
      cursorElementRef.current.style.display = "none";
    }

    init();

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }

      if (cursorElementRef.current) {
        cursorElementRef.current.style.display = "none";
      }

      if (clickProgressRef.current && clickProgressRef.current.parentNode) {
        clickProgressRef.current.parentNode.removeChild(
          clickProgressRef.current
        );
      }

      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return { videoRef, canvasRef };
}

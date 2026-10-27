"use client";
import { useEffect, useRef, useState } from "react";
type Kit = {
  init: (options: {
    faceDetectionMode: string;
    imageFormat: string;
    width: number;
    height: number;
  }) => void;
  open: () => void;
  close: () => void;
  addEventListener: (
    event: string,
    callback: (data: unknown) => void,
  ) => string | number;
  removeEventListener: (id: string | number) => void;
};
declare global {
  interface Window {
    YMK?: Kit;
  }
}
let loading: Promise<Kit> | null = null;
function loadKit(): Promise<Kit> {
  if (window.YMK) return Promise.resolve(window.YMK);
  if (loading) return loading;
  loading = new Promise<Kit>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://plugins-media.makeupar.com/v2.2-camera-kit/sdk.js";
    script.async = true;
    const timer = setTimeout(() => {
      script.remove();
      reject(new Error("The camera kit didn’t load. Please use photo upload."));
    }, 15_000);
    script.onload = () => {
      clearTimeout(timer);
      if (window.YMK) resolve(window.YMK);
      else {
        script.remove();
        reject(
          new Error("The camera kit is unavailable. Please use photo upload."),
        );
      }
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(
        new Error("The camera kit couldn’t load. Please use photo upload."),
      );
    };
    document.head.appendChild(script);
  }).catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}
function capturedImage(value: unknown): string | null {
  if (typeof value === "string")
    return value.startsWith("data:image/")
      ? value
      : /^[A-Za-z0-9+/]+=*$/.test(value)
        ? `data:image/jpeg;base64,${value}`
        : null;
  if (value && typeof value === "object")
    for (const key of ["image", "imageData", "imageBase64", "base64", "data"]) {
      const result = (value as Record<string, unknown>)[key];
      if (typeof result === "string") return capturedImage(result);
    }
  return null;
}
export function Camera({
  onCapture,
  onClose,
}: {
  onCapture: (image: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("Loading YouCam Camera Kit…");
  const captureRef = useRef(onCapture);
  useEffect(() => {
    captureRef.current = onCapture;
  }, [onCapture]);
  useEffect(() => {
    dialog.current?.showModal();
    let stopped = false,
      kit: Kit | undefined,
      listener: string | number | undefined;
    void loadKit()
      .then((sdk) => {
        if (stopped) return;
        kit = sdk;
        kit.init({
          faceDetectionMode: "skincare",
          imageFormat: "base64",
          width: Math.min(440, window.innerWidth - 64),
          height: 480,
        });
        listener = kit.addEventListener("faceDetectionCaptured", (data) => {
          if (stopped) return;
          const image = capturedImage(data);
          if (image) captureRef.current(image);
          else
            setMessage(
              "We couldn’t read the capture. Close the camera and use photo upload.",
            );
        });
        kit.open();
        setMessage(
          "Look straight ahead. Keep your full face inside the guide.",
        );
      })
      .catch((error) => {
        if (!stopped)
          setMessage(
            error instanceof Error
              ? error.message
              : "Camera unavailable. Use photo upload.",
          );
      });
    return () => {
      stopped = true;
      if (listener !== undefined) kit?.removeEventListener(listener);
      kit?.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="camera-dialog"
      aria-labelledby="camera-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="camera-header">
        <h2 id="camera-title">A consistent check-in</h2>
        <button
          className="key-button"
          type="button"
          onClick={onClose}
          aria-label="Close camera"
        >
          ✕
        </button>
      </div>
      <p role="status">{message}</p>
      <div id="YMK-module" />
      <p>Soft daylight · no makeup or filters · same distance</p>
      <button className="key-button" type="button" onClick={onClose}>
        Close & use photo upload
      </button>
    </dialog>
  );
}

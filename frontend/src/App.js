import React, { useState, useRef, useEffect } from "react";
import { io } from "socket.io-client";

function App() {
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [error, setError] = useState("");
  const socketRef = useRef(null);

  useEffect(() => {
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile && selectedFile.type === "text/csv") {
      setFile(selectedFile);
      setError("");
    } else {
      setError("Выберите файл формата CSV");
      setFile(null);
    }
  };

  const handleProcess = () => {
    if (!file) {
      setError("Сначала загрузите файл CSV");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setProcessProgress(0);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded * 100) / event.total);
        console.log("Прогресс загрузки:", percentComplete);
        setUploadProgress(percentComplete);
      }
    });

    xhr.onload = () => {
      if (xhr.status === 200) {
        console.log("Файл загружен на сервер");
        setUploadProgress(100);
        startProcessing();
      } else {
        handleError(new Error(`Ошибка сервера: ${xhr.status}`));
      }
    };

    xhr.onerror = (err) => {
      console.error("Ошибка XHR:", err);
      handleError(new Error("Ошибка сети или сервера"));
    };

    xhr.ontimeout = () => {
      handleError(new Error("Превышено время ожидания"));
    };

    xhr.open("POST", "https://web-application-f.onrender.com/upload-csv");
    xhr.timeout = 30000;
    xhr.send(formData);
  };

  const startProcessing = () => {
    setIsUploading(false);
    setIsProcessing(true);

    socketRef.current = io("https://web-application-f.onrender.com", {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 3,
      timeout: 30000,
    });

    socketRef.current.on("connect", () => console.log("WebSocket подключён"));
    socketRef.current.on("progress", (data) => setProcessProgress(data.progress || 0));
    socketRef.current.on("file_ready", handleFileReady);
    socketRef.current.on("error", handleError);
    socketRef.current.on("disconnect", () => console.log("WebSocket отключён"));

    socketRef.current.emit("process_csv", {});
  };

  const handleFileReady = (data) => {
    try {
      const blob = new Blob([data.data], { type: "text/csv;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename || "обработанный_файл.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      alert("Файл успешно обработан и загружен!");
    } catch (err) {
      setError(`Ошибка сохранения: ${err.message}`);
    } finally {
      cleanup();
    }
  };

  const handleError = (err) => {
    console.error("Ошибка:", err);
    setError(`Ошибка: ${err.message || err}`);
    cleanup();
  };

  const cleanup = () => {
    setIsProcessing(false);
    setProcessProgress(0);
    setFile(null);
    if (socketRef.current) socketRef.current.disconnect();
  };

  const ProgressBar = ({ progress, label, color }) => (
    <div style={{ marginTop: "10px" }}>
      <p style={{ margin: "5px 0", fontSize: "14px", color: "#555" }}>{label}</p>
      <div
        style={{
          width: "100%",
          height: "20px",
          border: "1px solid #ddd",
          borderRadius: "10px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            backgroundColor: progress === 100 ? "#4CAF50" : color,
            transition: "width 0.3s ease",
          }}
        />
        <span
          style={{
            position: "relative",
            top: "-20px",
            left: "50%",
            transform: "translateX(-50%)",
            color: "white",
            fontSize: "12px",
            fontWeight: "bold",
          }}
        >
          {progress}%
        </span>
      </div>
    </div>
  );

  return (
    <div
      style={{
        padding: "20px",
        fontFamily: "Arial, sans-serif",
        maxWidth: "600px",
        margin: "0 auto",
      }}
    >
      <h1>Обработка CSV‑файла</h1>

      {error && (
        <div
          style={{
            color: "red",
            backgroundColor: "#ffeaea",
            padding: "10px",
            borderRadius: "5px",
            marginBottom: "15px",
            border: "1px solid #ffcccc",
          }}
        >
          {error}
        </div>
      )}

      <input
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        disabled={isUploading || isProcessing}
        style={{
          display: "block",
          marginBottom: "15px",
          padding: "8px",
          border: "1px solid #ccc",
          borderRadius: "4px",
          width: "100%",
          boxSizing: "border-box",
        }}
      />

      <button
        onClick={handleProcess}
        disabled={!file || isUploading || isProcessing}
        style={{
          padding: "10px 20px",
          backgroundColor: isUploading || isProcessing ? "#cccccc" : "#007bff",
          color: "white",
          border: "none",
          borderRadius: "5px",
          cursor: !file || isUploading || isProcessing ? "not-allowed" : "pointer",
          width: "100%",
          fontSize: "16px",
          marginBottom: "15px",
        }}
      >
        {isUploading
          ? "Загружается..."
          : isProcessing
          ? "Обрабатывается..."
          : "Обработать CSV"}
      </button>

      {isUploading && (
        <ProgressBar
          progress={uploadProgress}
          label="Загрузка на сервер:"
          color="#FF9800"
        />
      )}

      {isProcessing && (
        <ProgressBar
          progress={processProgress}
          label="Обработка нейросетью:"
          color="#2196F3"
        />
      )}

      {(isUploading || isProcessing) && (
        <p
          style={{
            textAlign: "center",
            marginTop: "10px",
            color: "#777",
            fontSize: "14px",
          }}
        >
          Пожалуйста, не закрывайте страницу
        </p>
      )}
    </div>
  );
}

export default App

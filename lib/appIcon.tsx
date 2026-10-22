import { ImageResponse } from "next/og";

// Icono de la app: fondo negro con la barra clara del logo
export function appIcon(size: number) {
  const barW = Math.round(size * 0.07);
  const barH = Math.round(size * 0.42);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
        }}
      >
        <div style={{ width: barW, height: barH, background: "#f3efe7" }} />
      </div>
    ),
    { width: size, height: size }
  );
}

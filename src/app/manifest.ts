import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TruPath Ops",
    short_name: "TruPath",
    description: "Sales, factory, stock and dispatch workspace for Trupaths Ventures.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f4ef",
    theme_color: "#0f766e",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}

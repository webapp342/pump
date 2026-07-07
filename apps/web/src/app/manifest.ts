import type { MetadataRoute } from "next";

const appDescription =
  "Launch, trade, and earn on BSC bonding curves. Pro trader terminal with rewards layer.";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Pump — BSC Meme Launchpad",
    short_name: "Pump",
    description: appDescription,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0a0b0d",
    theme_color: "#0052ff",
    categories: ["finance", "business"],
    icons: [
      {
        src: "/pwa/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/pwa/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}

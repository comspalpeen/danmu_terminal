import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 开启图片防盗链白名单 (允许显示抖音头像)
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.douyinpic.com" },
      { protocol: "http", hostname: "**.douyinpic.com" },
      { protocol: "https", hostname: "p11.douyinpic.com" },
      { protocol: "https", hostname: "p26.douyinpic.com" },
      { protocol: "https", hostname: "p3.douyinpic.com" },
      { protocol: "https", hostname: "p3-webcast.douyinpic.com" },
      { protocol: "https", hostname: "***.byteimg.com" },
      { protocol: "http", hostname: "***.byteimg.com" },
      { protocol: "http", hostname: "p3-webcast.douyinpic.com" },
      { protocol: "https", hostname: "gss0.baidu.com" },
      { protocol: "https", hostname: "tb.1.bdstatic.com" },
    ],
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "echarts",
      "echarts-for-react",
      "framer-motion",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-dialog",
      "@radix-ui/react-label",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-tabs"
    ]
  },

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:38324/api/:path*",
      },
    ];
  },
};

export default nextConfig;     
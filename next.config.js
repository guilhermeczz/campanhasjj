/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the running development server independent from production builds.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  reactStrictMode: true,
  // Remove o "N" animado do canto inferior esquerdo no ambiente de desenvolvimento.
  devIndicators: false
};
module.exports = nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the running development server independent from production builds.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  reactStrictMode: true
};
module.exports = nextConfig;

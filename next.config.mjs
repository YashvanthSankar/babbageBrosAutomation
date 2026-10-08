/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // A separate preview directory prevents a second dev server from sharing
  // compiled assets with an existing server or production build.
  distDir: process.env.NEXT_BUILD_DIR || '.next',
};
export default nextConfig;

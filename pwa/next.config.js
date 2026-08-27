/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 'standalone' - Next kopira samo potrebne node_modules u .next/standalone,
  // sto pravi mnogo manju Docker sliku (vidi Dockerfile).
  output: 'standalone',
};

module.exports = nextConfig;

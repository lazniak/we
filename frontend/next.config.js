const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  turbopack: {
    root: path.resolve(__dirname, '../'),
  },
  // Rewrites only for development - production uses Nginx
  async rewrites() {
    if (process.env.NODE_ENV === 'production') {
      return [];
    }
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
      {
        source: '/ws/:path*',
        destination: 'http://localhost:3001/ws/:path*',
      },
    ];
  },
};

module.exports = nextConfig;

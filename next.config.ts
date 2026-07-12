import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Same "exclude the Node.js ONNX runtime from the browser bundle" trick
    // works with both bundlers — declared twice so the config is bundler-
    // agnostic and Vercel can use Turbopack (which now creates .next/lock
    // for its output tracer — a webpack build doesn't, so Vercel's deploy
    // stage was failing with `ENOENT: /vercel/path0/.next/lock`).
    turbopack: {
        resolveAlias: {
            'onnxruntime-node': './src/lib/empty-module.ts',
        },
    },
    webpack: (config, { isServer }) => {
        if (!isServer) {
            config.resolve.alias = {
                ...config.resolve.alias,
                'onnxruntime-node': false,
            };
        }
        return config;
    },
};

export default nextConfig;

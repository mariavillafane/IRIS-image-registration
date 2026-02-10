const { createProxyMiddleware } = require("http-proxy-middleware");
console.log("main setupProxy.js loaded");
// const http = require('http');

// Keep-alive agent so sockets are reused for large uploads
// const keepAliveAgent = new http.Agent({ keepAlive: true });

module.exports = function (app) {
  app.use(
    "/api",
    createProxyMiddleware({
      // Point to backend root and let the path (/api) be preserved
      target: "http://localhost:4000/api",
      changeOrigin: true,
      followRedirects: true,
      secure: false,
      logLevel: "error",

      // Prevent the proxy from timing out on long uploads
      proxyTimeout: 0,
      timeout: 0,
      // agent: keepAliveAgent,

      onProxyReq: (proxyReq, req, res) => {
        // Helpful logging for debugging
        console.log(
          `Proxying request: ${req.method} ${req.originalUrl} -> ${proxyReq.path}`
        );

        // Ensure connection stays alive for long uploads
        proxyReq.setHeader("Connection", "keep-alive");

        // Forward Content-Length header when present so the proxy streams correctly
        const contentLength = req.headers["content-length"];
        if (contentLength) {
          proxyReq.setHeader("Content-Length", contentLength);
        }
      },

      onError: (err, req, res) => {
        console.error("Proxy error:", err && err.message);
        if (!res.headersSent) {
          res.writeHead(502, { "Content-Type": "text/plain" });
        }
        try {
          res.end("Proxy error");
        } catch (e) {}
      },
    })
  );
};

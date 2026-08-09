import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      "build:demo-dependencies": {
        command:
          "vp run --cache --filter 'satteri-link-card...' --filter 'satteri-link-mention...' build",
        cache: false,
      },
      "dev:workspace": {
        command:
          "vp run --parallel --filter @itoshinji/link-preview --filter satteri-link-card --filter satteri-link-mention --filter satteri-links-demo dev",
        dependsOn: ["build:demo-dependencies"],
        cache: false,
      },
    },
  },
  staged: {
    "*": "vp check --fix",
  },
  pack: {
    dts: {
      tsgo: true,
    },
    exports: false,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});

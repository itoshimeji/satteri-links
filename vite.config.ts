import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      "build:packages": {
        command:
          "vp run --cache --filter 'satteri-link-card...' --filter 'satteri-link-mention...' --filter 'satteri-heading-link...' build",
        cache: false,
      },
      "check:workspace": {
        command: "vp check",
        dependsOn: ["build:packages"],
        cache: false,
      },
      "test:workspace": {
        command:
          "vp run --filter @itoshinji/link-preview --filter satteri-link-card --filter satteri-link-mention --filter satteri-heading-link test",
        dependsOn: ["build:packages"],
        cache: false,
      },
      "dev:workspace": {
        command:
          "vp run --parallel --filter @itoshinji/link-preview --filter satteri-link-card --filter satteri-link-mention --filter satteri-heading-link --filter satteri-links-demo dev",
        dependsOn: ["build:packages"],
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

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";

const directory = new URL("../public/branding/", import.meta.url);
await mkdir(directory, { recursive: true });
const icon = await readFile(new URL("yoink-icon.svg", directory), "utf8");
for (const size of [32, 180, 192, 512]) {
  const renderer = new Resvg(icon, { fitTo: { mode: "width", value: size } });
  await writeFile(
    new URL(`yoink-icon-${size}.png`, directory),
    renderer.render().asPng(),
  );
}
for (const name of ["yoink-logo", "yoink-logo-light"]) {
  const svg = await readFile(new URL(`${name}.svg`, directory), "utf8");
  const renderer = new Resvg(svg, { fitTo: { mode: "width", value: 1144 } });
  await writeFile(new URL(`${name}.png`, directory), renderer.render().asPng());
}

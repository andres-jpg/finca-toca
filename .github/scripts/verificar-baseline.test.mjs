import assert from "node:assert/strict";
import { test } from "node:test";
import { BASELINE, evaluarBaseline } from "./verificar-baseline.mjs";

const json = (migrations) => JSON.stringify({ migrations, message: "Migrations listed" });
const tabla = (filas) =>
  [
    "",
    "   Local            | Remote           | Time (UTC)            ",
    "  ------------------|------------------|-----------------------",
    ...filas.map(([l, r]) => `   ${l ? `\`${l}\`` : "                "} | ${r ? `\`${r}\`` : "                "} | \`2026-10-19 00:00:00\` `),
    "",
  ].join("\n");

test("JSON: baseline aplicada en el remoto → ok", () => {
  const r = evaluarBaseline(json([{ local: BASELINE, remote: BASELINE, time: "x" }]));
  assert.equal(r.ok, true);
});

test("JSON: baseline pendiente (remote vacío) → falla con instrucciones de repair", () => {
  const r = evaluarBaseline(
    json([
      { local: BASELINE, remote: "", time: "x" },
      { local: "20261025120000", remote: "", time: "y" },
    ]),
  );
  assert.equal(r.ok, false);
  assert.match(r.mensaje, /migration repair --status applied 20261019000000/);
});

test("JSON: remote ausente o null cuenta como pendiente", () => {
  assert.equal(evaluarBaseline(json([{ local: BASELINE }])).ok, false);
  assert.equal(evaluarBaseline(json([{ local: BASELINE, remote: null }])).ok, false);
});

test("JSON: baseline ok y otras migraciones pendientes → ok (es lo que debe empujar)", () => {
  const r = evaluarBaseline(
    json([
      { local: BASELINE, remote: BASELINE },
      { local: "20261025120000", remote: "" },
    ]),
  );
  assert.equal(r.ok, true);
});

test("tabla: baseline aplicada → ok", () => {
  assert.equal(evaluarBaseline(tabla([[BASELINE, BASELINE]])).ok, true);
});

test("tabla: baseline pendiente → falla", () => {
  const r = evaluarBaseline(tabla([[BASELINE, ""], ["20261025120000", ""]]));
  assert.equal(r.ok, false);
});

test("tabla: baseline solo en el remoto (sin fichero local) cuenta como registrada", () => {
  assert.equal(evaluarBaseline(tabla([["", BASELINE]])).ok, true);
});

test("la baseline no aparece → falla cerrado", () => {
  assert.equal(evaluarBaseline(json([{ local: "20261025120000", remote: "20261025120000" }])).ok, false);
  assert.equal(evaluarBaseline(tabla([])).ok, false);
});

test("salida vacía o ilegible → falla cerrado", () => {
  assert.equal(evaluarBaseline("").ok, false);
  assert.equal(evaluarBaseline("{ no es json").ok, false);
  assert.equal(evaluarBaseline("Cannot connect to the Docker daemon").ok, false);
});

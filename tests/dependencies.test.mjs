import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import sharp from "sharp";
import yaml from "js-yaml";
import { SourceMapGenerator, SourceMapConsumer } from "source-map-js";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
const require = createRequire(import.meta.url);

test("patched sharp native binary converts a synthetic SVG to PNG", async () => {
  const image = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"><rect width="4" height="3" fill="blue"/></svg>');
  const png = await sharp(image).png().toBuffer();
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.width,4);assert.equal(metadata.height,3);assert.equal(metadata.format,"png");
});

test("both brace-expansion majors preserve normal glob expansion", () => {
  const legacy=require("brace-expansion");
  const modern=require("../node_modules/@typescript-eslint/typescript-estree/node_modules/brace-expansion").expand;
  for(const expand of [legacy,modern]) assert.deepEqual(expand("{customer,job}-{1,2}"),["customer-1","customer-2","job-1","job-2"]);
});

test("patched YAML loader preserves normal aliases and mappings", () => {
  const result=yaml.load("base: &base\n  status: scheduled\njob:\n  <<: *base\n  amount: 450000\n");
  assert.equal(result.job.status,"scheduled");assert.equal(result.job.amount,450000);
});

test("patched source-map-js preserves source mapping round trips", () => {
  const generator=new SourceMapGenerator({file:"synthetic.css"});
  generator.addMapping({generated:{line:1,column:0},original:{line:2,column:3},source:"synthetic.input.css"});
  const consumer=new SourceMapConsumer(generator.toJSON());
  const position=consumer.originalPositionFor({line:1,column:0});assert.equal(position.line,2);assert.equal(position.column,3);
});

test("patched Zod handles normal input and rejects over-limit collections", () => {
  const schema=z.object({title:z.string(),items:z.array(z.number()).max(2)});
  assert.deepEqual(schema.parse({title:"synthetic",items:[1,2]}),{title:"synthetic",items:[1,2]});
  const result=z.array(z.never()).max(1).safeParse([1,2]);assert.equal(result.success,false);
  assert.equal(result.error.issues[0].code,"too_big");
});

test("OpenAI structured output helper remains compatible without an API call", () => {
  const format=zodTextFormat(z.object({title:z.string(),amount:z.number()}),"synthetic");
  assert.equal(format.type,"json_schema");assert.equal(format.name,"synthetic");assert.equal(format.strict,true);
});

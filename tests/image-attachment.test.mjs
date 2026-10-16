import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareReferenceImage,MAX_SOURCE_IMAGE_BYTES} from '../public/js/image-attachment.js';

function dependencies(dataURL='data:image/jpeg;base64,ZmFrZQ==') {
  const canvas={getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=>dataURL};
  return {canvas,options:{createBitmap:async()=>({width:3200,height:1600,close(){}}),createCanvas:()=>canvas}};
}

test('Reference images are resized to JPEG with a bounded longest side',async()=>{
  const {canvas,options}=dependencies();
  const result=await prepareReferenceImage({name:'concept.png',type:'image/png',size:1024},options);
  assert.equal(result,'data:image/jpeg;base64,ZmFrZQ==');
  assert.equal(canvas.width,1600);assert.equal(canvas.height,800);
});

test('Reference image input rejects unsupported or oversized files',async()=>{
  const {options}=dependencies();
  await assert.rejects(()=>prepareReferenceImage({name:'drawing.svg',type:'image/svg+xml',size:100},options),/JPG, PNG or WebP/);
  await assert.rejects(()=>prepareReferenceImage({name:'large.jpg',type:'image/jpeg',size:MAX_SOURCE_IMAGE_BYTES+1},options),/8 MiB/);
});

export const MAX_SOURCE_IMAGE_BYTES=8*1024*1024;
const MAX_IMAGE_BYTES=2*1024*1024;
const MAX_IMAGE_SIDE=1600;
const TYPES=new Set(['image/jpeg','image/png','image/webp']);

function decodedBytes(dataURL) {
  const value=dataURL.slice(dataURL.indexOf(',')+1);
  return Math.floor(value.length*3/4)-(value.endsWith('==')?2:value.endsWith('=')?1:0);
}

export async function prepareReferenceImage(file,{createBitmap=globalThis.createImageBitmap,createCanvas=()=>document.createElement('canvas')}={}) {
  if(!file||!TYPES.has(file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
  if(file.size>MAX_SOURCE_IMAGE_BYTES) throw new Error('Image too large (maximum 8 MiB).');
  let bitmap;
  try { bitmap=await createBitmap(file); }
  catch { throw new Error('Unable to read this image.'); }
  try {
    if(!Number.isFinite(bitmap.width)||!Number.isFinite(bitmap.height)||bitmap.width<1||bitmap.height<1) throw new Error('Unable to read this image.');
    let scale=Math.min(1,MAX_IMAGE_SIDE/Math.max(bitmap.width,bitmap.height));
    const canvas=createCanvas(),context=canvas.getContext('2d');
    if(!context) throw new Error('Unable to prepare this image.');
    for(let attempt=0;attempt<5;attempt++) {
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const dataURL=canvas.toDataURL('image/jpeg',Math.max(.62,.84-attempt*.05));
      if(/^data:image\/jpeg;base64,/.test(dataURL)&&decodedBytes(dataURL)<=MAX_IMAGE_BYTES) return dataURL;
      scale*=.75;
    }
    throw new Error('Image remains too large after resizing.');
  } finally { bitmap?.close?.(); }
}

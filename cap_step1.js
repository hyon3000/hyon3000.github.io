// Step 1: Capture rawblocks only, save cache to file
const puppeteer=require('puppeteer'),fs=require('fs'),path=require('path');
(async()=>{
  const b=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const pg=await b.newPage();await pg.setViewport({width:120,height:120});
  const base='file://'+path.resolve('polynomino/web/block-preview.html');
  const cache={};
  for(let i=0;i<=92;i++){
    await pg.goto(base+'?i='+i,{waitUntil:'domcontentloaded'});
    await new Promise(r=>setTimeout(r,300));
    cache[i]=(await pg.evaluate(()=>document.getElementById('c').toDataURL('image/png'))).replace(/^data:image\/png;base64,/,'');
    if(i%20===0)process.stdout.write('.');
  }
  await b.close();
  fs.writeFileSync('/tmp/raw_cache.json',JSON.stringify(cache));
  console.log(' saved');
})();

// Step 2: Capture random blocks, merge with rawblock cache, update HTML
const puppeteer=require('puppeteer'),fs=require('fs'),path=require('path');
(async()=>{
  const cache=JSON.parse(fs.readFileSync('/tmp/raw_cache.json','utf8'));
  const b=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const pg=await b.newPage();await pg.setViewport({width:120,height:120});
  // Load a blank page then draw random blocks via evaluate
  await pg.goto('file://'+path.resolve('polynomino/web/block-preview.html')+'?i=0',{waitUntil:'domcontentloaded'});
  await new Promise(r=>setTimeout(r,300));

  for(let cnt=7;cnt<=14;cnt++){
    await pg.evaluate((cnt)=>{
      const c=document.getElementById('c'),ctx=c.getContext('2d');
      ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height);
      let _s=cnt*12345+67890;function sr(){_s=(_s*1103515245+12345)&0x7fffffff;return _s;}
      const g=Array.from({length:7},()=>Array(7).fill(0));
      let rr=3,cc=3,n=0;const val=158+cnt;
      while(n<cnt){if(g[rr][cc]===0){g[rr][cc]=val;n++;}switch(sr()%4){case 0:rr=Math.min(6,rr+1);break;case 1:rr=Math.max(0,rr-1);break;case 2:cc=Math.min(6,cc+1);break;default:cc=Math.max(0,cc-1);}}
      const cells=[];let rM=99,rX=-99,cM=99,cX=-99;
      for(let r=0;r<7;r++)for(let c2=0;c2<7;c2++)if(g[r][c2]!==0){cells.push([r,c2]);rM=Math.min(rM,r);rX=Math.max(rX,r);cM=Math.min(cM,c2);cX=Math.max(cX,c2);}
      const bw=cX-cM+1,bh=rX-rM+1,cs=Math.floor(c.width*0.85/Math.max(bw,bh));
      const ox=(c.width-bw*cs)/2,oy=(c.height-bh*cs)/2;
      let pic=(val&127)^64;const R=pic>>4,G=(pic>>2)&3,B=pic&3;
      let cr=Math.round((R+0.6)/8.0*255),cg=Math.round((G+0.8)/4.4*255),cb=Math.round((B+0.8)/4.4*255);
      if((val&255)>127){cr=Math.floor(cr*0.65);cg=Math.floor(cg*0.65);cb=Math.floor(cb*0.65);}
      for(const[r,c2]of cells){const x=ox+(c2-cM)*cs,y=oy+(r-rM)*cs;ctx.fillStyle='rgb('+cr+','+cg+','+cb+')';ctx.fillRect(x,y,cs,cs);const m=cs*0.13;ctx.fillStyle='rgb('+Math.min(255,Math.round(cr*1.2))+','+Math.min(255,Math.round(cg*1.2))+','+Math.min(255,Math.round(cb*1.2))+')';ctx.fillRect(x+m,y+m,cs-m*2,cs-m*2);ctx.strokeStyle='rgba(0,0,0,0.3)';ctx.lineWidth=1;ctx.strokeRect(x,y,cs,cs);}
    },cnt);
    cache['r'+cnt]=(await pg.evaluate(()=>document.getElementById('c').toDataURL('image/png'))).replace(/^data:image\/png;base64,/,'');
    process.stdout.write('r'+cnt+' ');
  }
  await b.close();
  console.log('random done');

  // Replace in HTML
  const htmlPath=path.resolve('polynomino/game.html');
  let html=fs.readFileSync(htmlPath,'utf8');
  const mapping=[];
  for(let i=0;i<29;i++)mapping.push(i);for(let i=0;i<29;i++)mapping.push(i);
  for(let i=29;i<=88;i++)mapping.push(i);for(let i=89;i<=92;i++)mapping.push(i);
  for(let c=7;c<=14;c++)mapping.push('r'+c);
  for(let i=29;i<=88;i++)mapping.push(i);for(let i=89;i<=92;i++)mapping.push(i);
  for(let c=7;c<=14;c++)mapping.push('r'+c);

  const re=/class="si"><img src="data:image\/png;base64,([^"]+)"><span>/g;
  const entries=[];let m;while((m=re.exec(html))!==null)entries.push({oldB64:m[1]});
  let count=0;
  for(let e=0;e<entries.length;e++){
    const key=mapping[e];const nb=cache[key];if(!nb)continue;
    const old='<img src="data:image/png;base64,'+entries[e].oldB64+'">';
    const nw='<img src="data:image/png;base64,'+nb+'">';
    const pos=html.indexOf(old);
    if(pos>=0){html=html.substring(0,pos)+nw+html.substring(pos+old.length);count++;}
  }
  fs.writeFileSync(htmlPath,html);
  console.log('Polynomino:',count,'/',entries.length);
})();

/* ---------- falling streak background ---------- */
(function(){
  var cv=document.getElementById('fx'),cx=cv.getContext('2d');
  var W=0,H=0,dpr=1,streaks=[],last=0;
  var calm=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function size(){
    dpr=Math.min(2,window.devicePixelRatio||1);W=window.innerWidth;H=window.innerHeight;
    cv.width=W*dpr;cv.height=H*dpr;cx.setTransform(dpr,0,0,dpr,0,0);
    var n=Math.max(28,Math.min(72,Math.round(W/20)));
    while(streaks.length<n)streaks.push(make(true));
    streaks.length=n;
  }
  function make(init){
    var org=Math.random()<.62;
    return {x0:Math.random()*W,t:init?Math.random()*1.3:-Math.random()*.35,v:.0011+Math.random()*.0021,len:.1+Math.random()*.22,
      bend:.28+Math.random()*.55,col:org?'255,79,31':'255,255,255',a:.3+Math.random()*.5,w:.6+Math.random()*1.1};
  }
  function pos(s,t){var k=s.x0/W-.5;return [s.x0+k*W*s.bend*t*t,t*(H+120)-60]}
  function frame(ts){
    var dt=Math.min(50,ts-last)||16;last=ts;
    cx.clearRect(0,0,W,H);
    for(var i=0;i<streaks.length;i++){
      var s=streaks[i];
      if(!calm)s.t+=s.v*dt/16;
      if(s.t-s.len>1.1){streaks[i]=make(false);continue}
      var n=10,pts=[];
      for(var j=0;j<=n;j++)pts.push(pos(s,s.t-s.len*(1-j/n)));
      var g=cx.createLinearGradient(pts[0][0],pts[0][1],pts[n][0],pts[n][1]);
      g.addColorStop(0,'rgba('+s.col+',0)');g.addColorStop(1,'rgba('+s.col+','+s.a+')');
      cx.strokeStyle=g;cx.lineWidth=s.w;cx.beginPath();cx.moveTo(pts[0][0],pts[0][1]);
      for(j=1;j<=n;j++)cx.lineTo(pts[j][0],pts[j][1]);cx.stroke();
      cx.fillStyle='rgba('+s.col+','+Math.min(1,s.a+.35)+')';
      cx.beginPath();cx.arc(pts[n][0],pts[n][1],s.w*1.3+.5,0,6.283);cx.fill();
    }
    if(!calm&&!document.hidden)requestAnimationFrame(frame);
  }
  size();
  window.addEventListener('resize',function(){size();if(calm)frame(performance.now())});
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&!calm){last=performance.now();requestAnimationFrame(frame)}});
  requestAnimationFrame(frame);
})();

/* ---------- app ---------- */
(function(){
  var $=function(s,r){return (r||document).querySelector(s)};
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
  var uid=function(){return Math.random().toString(36).slice(2,9)};
  var pad=function(n){return String(n).padStart(2,'0')};
  var ymd=function(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
  var fmtDate=function(s){if(!s)return '';var d=new Date(s+'T00:00:00');return isNaN(d)?s:d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})};
  var fmtDur=function(s){if(!isFinite(s)||!s)return '';var h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=Math.round(s%60);return h?h+':'+pad(m)+':'+pad(x):m+':'+pad(x)};
  var calm=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var toastT;
  function toast(msg){var t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove('show')},2200)}
  var CHECK='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>';
  function tween(el,to){
    var from=+el.textContent||0;
    if(calm||from===to){el.textContent=to;return}
    var t0=performance.now();
    (function f(t){var k=Math.min(1,(t-t0)/450);el.textContent=Math.round(from+(to-from)*k);if(k<1)requestAnimationFrame(f)})(t0);
  }

  /* ----- state ----- */
  var PLATS=['SHORTS','REELS','X','TIKTOK'];
  var REELS=[{h:16,w:['WAIT FOR IT','NO WAY','CLIP THAT'],n:'Sample reel 1'},{h:205,w:['HE DID IT','WATCH THIS','INSANE'],n:'Sample reel 2'},{h:148,w:['LOOK AT CHAT','THAT WAS CLEAN','GG'],n:'Sample reel 3'},{h:282,w:['PART 2 SOON','RUN IT BACK','NOT AGAIN'],n:'Sample reel 4'}];
  var demos=REELS.map(function(r,i){return {id:'demo'+i,demo:true,kind:'demo',name:r.n,reel:i,platform:PLATS[i%4],progress:100}});
  var today=new Date(),due=new Date(today.getTime()+14*864e5);
  function blankInvoice(n){
    return {from:{name:'Northlight Studio',email:'hello@northlight.studio',addr:'14 Church Street\nBengaluru 560001'},
      to:{name:'Riya Menon',email:'riya@peakpodcast.in',addr:'Peak Podcast Network\nMumbai 400001'},
      number:'INV-2026-'+String(n||1).padStart(3,'0'),issue:ymd(today),due:ymd(due),currency:'INR',taxLabel:'GST',taxRate:18,discount:0,
      notes:'Payment due within 14 days. Bank transfer or UPI accepted.',
      items:[{id:uid(),desc:'Podcast episode 42: 10 short-form clips',qty:1,rate:12000},{id:uid(),desc:'Captions and 9:16 reframe',qty:10,rate:500}]};
  }
  var saved=[];
  var inv=blankInvoice(1);
  var clips=[],parts=[],sel=null,focusId=null,phPoster={},phBusy=false;
  var server={ffmpeg:true,linkImport:false,maxUploadMB:2048};
  var opts={auto:false,n:8,len:30,fmt:'crop'};
  try{var o0=JSON.parse(localStorage.getItem('clippng.opts')||'{}');if(o0&&typeof o0==='object'){opts.auto=!!o0.auto;opts.n=[5,8,10,15].indexOf(+o0.n)>=0?+o0.n:8;opts.len=[15,30,45,60].indexOf(+o0.len)>=0?+o0.len:30;opts.fmt=['crop','blur','original'].indexOf(o0.fmt)>=0?o0.fmt:'crop'}}catch(e){}
  function api(url,o){
    o=o||{};
    var init={method:o.method||'GET',headers:{}};
    if(o.body!==undefined){init.headers['Content-Type']='application/json';init.body=JSON.stringify(o.body)}
    return fetch(url,init).then(function(r){
      return r.json().catch(function(){return {}}).then(function(d){
        if(!r.ok)throw new Error(d.error||('Request failed ('+r.status+')'));
        return d;
      });
    });
  }
  function nextNo(){
    var m=0;
    saved.forEach(function(s){var d=/(\d+)$/.exec(s.inv.number);if(d&&+d[1]>m)m=+d[1]});
    return Math.max(m,saved.length)+1;
  }

  /* ----- routing ----- */
  var VIEWS=['clips','invoices','earnings','faq'];
  function route(){
    var h=(location.hash||'#clips').slice(1);
    if(VIEWS.indexOf(h)<0)h='clips';
    VIEWS.forEach(function(v){
      $('#view-'+v).hidden=v!==h;
      var a=$('#nav-'+v);if(v===h)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
    });
    var cv=$('#view-'+h);cv.classList.remove('enter');void cv.offsetWidth;cv.classList.add('enter');
    window.scrollTo(0,0);
  }
  window.addEventListener('hashchange',route);

  /* ----- sample reel (original animated placeholder) ----- */
  function reel(i){
    var r=REELS[(i||0)%REELS.length];
    return '<div class="reel" style="--h:'+r.h+'"><i class="b1"></i><i class="b2"></i><div class="cam"><em>LIVE</em><u></u></div>'+
      '<div class="game"><i></i><i></i><i></i><i></i></div><div class="caps"><b>'+r.w[0]+'</b><b>'+r.w[1]+'</b><b>'+r.w[2]+'</b></div><div class="rbar"><i></i></div></div>';
  }

  /* ----- clips ----- */
  function lib(){return clips.length?clips:demos}
  function current(){var a=parts.concat(lib());return a.filter(function(c){return c.id===sel})[0]||lib()[0]}
  function renderStats(){
    tween($('#st-clips'),clips.length);tween($('#st-made'),parts.length);
    tween($('#st-saved'),saved.length);
    tween($('#st-paid'),saved.filter(function(s){return s.status==='Paid'}).length);
  }
  function mainScreen(c){
    var vid=c&&!c.demo&&c.kind==='file'&&c.url&&!c.broken;
    var seg=vid&&c.start!=null;
    var media=vid?'<video id="pv" src="'+esc(c.url)+(seg?'#t='+c.start:'')+'" autoplay muted '+(seg?'':'loop ')+'playsinline preload="metadata"></video>':reel(c&&c.reel!=null?c.reel:0);
    var pl=c?c.platform:'SHORTS';
    var top='<div class="ptop"><span class="pill">'+esc(pl)+(c&&c.demo?' · SAMPLE':'')+'</span>'+(vid?'<button class="pill snd" type="button">Tap for sound</button>':'')+'</div>';
    var mid=vid?'<button class="pp" type="button" aria-label="Play or pause"></button>':'';
    var right='';
    if(c&&c.kind==='link')right='<a class="mono" href="'+esc(c.url)+'" target="_blank" rel="noopener">Open ↗</a>';
    else if(c&&c.duration)right='<span class="mono">'+fmtDur(c.duration)+'</span>';
    else right='<span class="mono">'+(c&&c.demo?'Sample':'Ready')+'</span>';
    var bot='<div class="pbot"><div class="row"><b>'+esc(c?c.name:'Sample reel')+'</b>'+right+'</div>'+(vid?'<div class="pbar"><i></i></div>':'')+'</div>';
    return '<div class="screen"'+posterStyle(c)+'>'+media+'</div>'+top+mid+bot;
  }
  function posterStyle(c){return c&&phPoster[c.id]?' style="background:#000 url(\''+phPoster[c.id]+'\') center/cover no-repeat"':''}
  function snap(phone){
    try{
      var scr=phone.querySelector('.screen'),v=scr&&scr.querySelector('video');
      if(!v||!v.videoWidth||!scr.offsetWidth)return null;
      var cw=240,ch=Math.max(1,Math.round(cw*scr.offsetHeight/scr.offsetWidth));
      var cv=document.createElement('canvas');cv.width=cw;cv.height=ch;
      var vw=v.videoWidth,vh=v.videoHeight,tr=cw/ch,vr=vw/vh,sx=0,sy=0,sw=vw,sh=vh;
      if(vr>tr){sw=vh*tr;sx=(vw-sw)/2}else{sh=vw/tr;sy=(vh-sh)/2}
      cv.getContext('2d').drawImage(v,sx,sy,sw,sh,0,0,cw,ch);
      return cv.toDataURL('image/jpeg',.72);
    }catch(e){return null}
  }
  function goTo(sp){
    var id=sp.getAttribute('data-sel');
    if(phBusy)return;
    var box=$('#phones'),main=box.querySelector('.phone.main');
    if(calm||!sp.animate||!main){sel=id;refresh();return}
    var other=[].slice.call(box.querySelectorAll('.phone.side')).filter(function(x){return x!==sp})[0];
    phBusy=true;
    var oldId=(current()||{}).id;
    var mr=main.getBoundingClientRect(),sr=sp.getBoundingClientRect();
    var dx=(mr.left+mr.width/2)-(sr.left+sr.width/2);
    var ct=getComputedStyle(main).translate;if(!ct||ct==='none')ct='0px 0px';
    var opt={duration:560,easing:'cubic-bezier(.22,.8,.2,1)',fill:'forwards'};
    sp.style.zIndex=3;
    var anim=sp.animate([{translate:'0px -50%',scale:.84,opacity:.62,filter:'blur(1.5px)'},{translate:dx+'px -50%',scale:1,opacity:1,filter:'blur(0px)'}],opt);
    main.animate([{translate:ct,scale:1,opacity:1,filter:'blur(0px)'},{translate:(-dx)+'px 0px',scale:.84,opacity:.62,filter:'blur(1.5px)'}],opt);
    if(other)other.animate([{opacity:.62,scale:.84},{opacity:0,scale:.7}],{duration:420,easing:'ease-out',fill:'forwards'});
    var done=false;
    function finish(){
      if(done)return;done=true;
      var pNew=snap(sp),pOld=snap(main);
      if(pNew)phPoster[id]=pNew;
      if(pOld&&oldId)phPoster[oldId]=pOld;
      sel=id;box.classList.add('swapped');refresh();
      phBusy=false;
      setTimeout(function(){box.classList.remove('swapped');phPoster={}},800);
    }
    anim.onfinish=finish;
    setTimeout(finish,900);
  }
  function sideScreen(c,fallback){
    if(c&&!c.demo&&c.kind==='file'&&c.url&&!c.broken){
      var seg=c.start!=null;
      return '<video class="sv" src="'+esc(c.url)+(seg?'#t='+c.start:'')+'" data-start="'+(seg?c.start:0)+'" data-end="'+(seg?c.end:0)+'" autoplay muted '+(seg?'':'loop ')+'playsinline preload="auto"></video>';
    }
    return reel(fallback);
  }
  function renderDlbar(){
    var c=current(),box=$('#dlbar');
    var ok=c&&!c.demo&&!c.uploading&&!c.importing&&c.dl;
    var isPart=!!(c&&c.parent!=null);
    box.innerHTML='<div class="dl-info"><span class="mono">'+(isPart?'Selected clip':(ok?'Selected video':'Download'))+'</span><b>'+esc(ok?c.name:'Select a clip to download it')+'</b></div>'+
      (ok?'<a class="btn o" href="'+esc(c.dl)+'" download>'+(isPart?'Download clip':'Download original')+'</a>':'<button class="btn" type="button" disabled>Download</button>');
  }
  function renderPhones(){
    var c=current();
    renderDlbar();
    var pool=(parts.length?parts:clips).filter(function(x){return x.kind==='file'&&x.url&&!x.broken});
    var idx=pool.indexOf(c),n=pool.length,L=null,R=null;
    if(idx>=0&&n>=2){R=pool[(idx+1)%n];if(n>=3)L=pool[(idx-1+n)%n]}
    $('#phones').innerHTML=
      '<div class="phone side l'+(L&&phPoster[L.id]?'':' fresh')+'"'+(L?' data-sel="'+L.id+'"':'')+' aria-hidden="true"><div class="notch"></div><div class="screen"'+posterStyle(L)+'>'+sideScreen(L,1)+'</div></div>'+
      '<div class="phone main"><div class="notch"></div>'+mainScreen(c)+'</div>'+
      '<div class="phone side r'+(R&&phPoster[R.id]?'':' fresh')+'"'+(R?' data-sel="'+R.id+'"':'')+' aria-hidden="true"><div class="notch"></div><div class="screen"'+posterStyle(R)+'>'+sideScreen(R,2)+'</div></div>';
    $('#phones').querySelectorAll('video.sv').forEach(function(sv){
      var st=+sv.getAttribute('data-start'),en=+sv.getAttribute('data-end');
      if(en>0){
        sv.addEventListener('loadedmetadata',function(){try{sv.currentTime=st}catch(e){}});
        sv.addEventListener('timeupdate',function(){if(sv.currentTime>=en)sv.currentTime=st});
      }
      var pr=sv.play();if(pr&&pr.catch)pr.catch(function(){});
    });
    var v=$('#pv');
    if(v){
      var seg=c.start!=null;
      if(seg)v.addEventListener('loadedmetadata',function(){try{v.currentTime=c.start}catch(e){}});
      v.addEventListener('timeupdate',function(){
        var i=$('#phones .pbar i');
        if(seg){
          if(v.currentTime>=c.end)v.currentTime=c.start;
          if(i)i.style.width=Math.max(0,Math.min(100,(v.currentTime-c.start)/(c.end-c.start)*100))+'%';
        }else if(i&&v.duration)i.style.width=(v.currentTime/v.duration*100)+'%';
      });
      v.addEventListener('error',function(){c.broken=true;renderPhones()});
      var p=v.play();if(p&&p.catch)p.catch(function(){});
    }
  }
  $('#phones').addEventListener('click',function(e){
    var sp=e.target.closest('.phone.side[data-sel]');
    if(sp){goTo(sp);return}
    var v=$('#pv');if(!v)return;
    var sn=e.target.closest('.snd');
    if(sn){v.muted=!v.muted;sn.textContent=v.muted?'Tap for sound':'Sound on';return}
    if(e.target.closest('a'))return;
    if(e.target.closest('.phone.main')){
      if(v.paused){var p=v.play();if(p&&p.catch)p.catch(function(){})}else v.pause();
      var pp=$('#phones .pp');if(pp)pp.classList.toggle('paused',v.paused);
    }
  });
  function renderLib(){
    var arr=lib(),cur=current(),isDemo=!clips.length;
    $('#lib-title').textContent=isDemo?'Sample clips':'Your uploads';
    $('#lib-sub').textContent=isDemo?'Upload a video to replace these samples, then press Clip it.':clips.length+(clips.length===1?' upload':' uploads')+'. Press Clip on any of them to cut it into many clips.';
    
    $('#libgrid').innerHTML=arr.map(function(c){
      var ready=c.demo||c.progress>=100;
      var age=c.born?Date.now()-c.born:9999,fresh=age<450;
      var media=(!c.demo&&c.kind==='file'&&c.url&&!c.broken)?'<video src="'+esc(c.url)+'#t=0.5" muted playsinline preload="metadata"></video>':reel(c.reel||0);
      var meta=c.demo?'SAMPLE':(c.kind==='file'?(fmtDur(c.duration)||'--:--'):'LINK');
      return '<div class="tcol'+(fresh?' pop':'')+'"'+(fresh?' style="animation-delay:-'+age+'ms"':'')+'>'+
        '<button class="vtile'+(cur&&c.id===cur.id?' on':'')+'" type="button" data-sel="'+c.id+'" aria-label="Preview '+esc(c.name)+'">'+media+
        (c.demo?'':'<span class="plat" data-plat="'+c.id+'" title="Change platform">'+esc(c.platform)+'</span>')+(c.state==='working'?'<span class="busy">Clipping…</span>':(c.importing?'<span class="busy">Importing…</span>':''))+
        (c.demo?'':(ready?'<span class="stt ok">'+CHECK+'</span>':'<span class="stt">'+Math.round(c.progress)+'%</span><span class="pg"><i style="width:'+c.progress+'%"></i></span>'))+
        '<span class="vov"><b>'+esc(c.name)+'</b><span class="mono">'+meta+'</span></span></button>'+
        (c.demo?'':'<div class="tact"><button class="mini o" data-act="clip" data-id="'+c.id+'" type="button">'+(c.state==='working'?'Clipping…':(parts.some(function(p){return p.parent===c.id})?'Re-clip':'Clip'))+'</button><button class="mini" data-act="bill" data-id="'+c.id+'" type="button">Bill</button><button class="mini ghost" data-act="rm" data-id="'+c.id+'" type="button">Remove</button></div>')+'</div>';
    }).join('');
    renderStats();
  }
  function refresh(){renderPhones();renderLib();renderResults();renderClipbar()}
  function addClip(c){
    c.id=uid();c.progress=0;c.born=Date.now();c.platform='SHORTS';c.reel=Math.floor(Math.random()*4);
    clips.unshift(c);sel=c.id;focusId=c.id;refresh();
    return c;
  }
  function failUpload(c,msg){
    clips=clips.filter(function(x){return x!==c});
    if(sel===c.id)sel=null;
    if(focusId===c.id)focusId=null;
    refresh();toast(msg);
  }
  function uploadFile(f){
    var local='';try{local=URL.createObjectURL(f)}catch(e){}
    var c=addClip({kind:'file',name:f.name,size:f.size,url:local,uploading:true});
    var fd=new FormData();fd.append('video',f);
    var x=new XMLHttpRequest();
    x.open('POST','/api/upload');
    x.upload.onprogress=function(e){
      if(!e.lengthComputable)return;
      c.progress=Math.min(99,e.loaded/e.total*100);
      var tl=document.querySelector('[data-sel="'+c.id+'"]');
      if(tl){var bar=tl.querySelector('.pg i'),st=tl.querySelector('.stt');if(bar)bar.style.width=c.progress+'%';if(st)st.textContent=Math.round(c.progress)+'%'}
    };
    x.onload=function(){
      var d={};try{d=JSON.parse(x.responseText)}catch(e){}
      if(x.status>=200&&x.status<300&&d.id){
        c.sid=d.id;c.duration=d.duration;c.size=d.size;c.dl=d.download;c.progress=100;c.uploading=false;
        refresh();
        if(opts.auto)startClip(c);
      }else failUpload(c,d.error||'Upload failed.');
    };
    x.onerror=function(){failUpload(c,'Upload failed. Check your connection.')};
    x.send(fd);
  }
  function addFiles(list){
    var n=0;
    Array.prototype.forEach.call(list,function(f){
      if(f.type&&f.type.indexOf('video')!==0)return;
      uploadFile(f);n++;
    });
    toast(n?(n>1?n+' videos':'Video')+' uploading':'Choose a video file');
  }
  var fin=$('#file-input'),panel=$('#panel');
  $('#pick-btn').addEventListener('click',function(){fin.click()});
  $('#hero-upload').addEventListener('click',function(){fin.click()});
  fin.addEventListener('change',function(){addFiles(fin.files);fin.value=''});
  ['dragenter','dragover'].forEach(function(ev){panel.addEventListener(ev,function(e){e.preventDefault();panel.classList.add('over')})});
  ['dragleave','drop'].forEach(function(ev){panel.addEventListener(ev,function(e){e.preventDefault();panel.classList.remove('over')})});
  panel.addEventListener('drop',function(e){if(e.dataTransfer)addFiles(e.dataTransfer.files)});
  $('#link-form').addEventListener('submit',function(e){
    e.preventDefault();var i=$('#link-input'),v=i.value.trim();
    if(!v){fin.click();return}
    if(!/^https?:\/\/\S+\.\S+/.test(v)){toast('Enter a full link starting with https://');return}
    if(!server.linkImport){toast('Link import is off on this server. Upload the video file instead.');return}
    var host=v.replace(/^https?:\/\//,'').split('/')[0];
    var c=addClip({kind:'file',name:host+' video',url:'',size:0,importing:true});
    c.progress=100;i.value='';renderLib();
    api('/api/upload-link',{method:'POST',body:{url:v}}).then(function(d){
      c.sid=d.id;c.name=d.name;c.duration=d.duration;c.size=d.size;c.url=d.url;c.dl=d.download;c.importing=false;
      refresh();toast('Video imported');
      if(opts.auto)startClip(c);
    }).catch(function(err){failUpload(c,err.message)});
  });
  /* ----- clipping (the server cuts real video files) ----- */
  var fmtRange=function(a,b){return (a?fmtDur(a):'0:00')+'–'+(b?fmtDur(b):'0:00')};
  function srcOf(id){return clips.filter(function(c){return c.id===id})[0]}
  function findAny(id){return parts.concat(clips).filter(function(x){return x.id===id})[0]}
  function setCP(c,v,t){
    c.cp=v;c.stage=t;
    var b=$('#clipbar .cb-bar i');if(b)b.style.width=v+'%';
    var st=$('#clipbar .cb-stage');if(st)st.textContent=t;
  }
  function makePart(src,jc,fresh){
    return {id:uid(),parent:src.id,kind:'file',url:jc.url,dl:jc.download,name:src.name.replace(/\.[^.]+$/,'')+' · '+jc.title,title:jc.title,
      duration:jc.duration,srcStart:jc.srcStart,srcEnd:jc.srcEnd,platform:'SHORTS',progress:100,score:jc.score,born:fresh?Date.now():0,reel:src.reel};
  }
  function renderClipbar(){
    var bar=$('#clipbar');
    var c=srcOf(focusId)||clips[0];
    bar.hidden=!c;
    if(!c){bar.innerHTML='';return}
    var made=parts.filter(function(p){return p.parent===c.id}).length;
    var info='<div class="cb-info"><b>'+esc(c.name)+'</b><span class="mono">'+(fmtDur(c.duration)||'Reading file')+(c.size?' · '+(c.size/1048576).toFixed(1)+' MB':'')+'</span></div>';
    if(c.state==='working'){
      bar.innerHTML=info+'<div class="cb-work"><div class="mono cb-stage">'+esc(c.stage||'Starting')+'</div><div class="cb-bar"><i style="width:'+(c.cp||0)+'%"></i></div></div>';
      return;
    }
    var busy=c.uploading||c.importing;
    var note=busy?(c.uploading?'Uploading the file…':'Importing the video…'):
      (made?made+(made===1?' clip':' clips')+' ready below.':(opts.auto?'Auto-clip is on. Clips start as soon as the upload finishes.':'Press Clip it to cut this into '+opts.n+' clips of about '+opts.len+' seconds.'))+(c.note?' '+c.note:'');
    bar.innerHTML=info+'<div class="cb-note">'+esc(note)+'</div><button class="btn o" id="cb-clip" type="button"'+(busy?' disabled':'')+'>'+(made?'Re-clip':'Clip it into '+opts.n+' clips')+'</button>';
  }
  function renderResults(){
    var box=$('#resgrid'),wrap=$('#results');
    wrap.hidden=!parts.length;
    if(!parts.length){box.innerHTML='';return}
    var srcs=clips.filter(function(c){return parts.some(function(p){return p.parent===c.id})});
    $('#res-sub').textContent=parts.length+(parts.length===1?' clip':' clips')+' from '+srcs.length+(srcs.length===1?' upload':' uploads')+'. Hover to play. Select one to open it on the phone.';
    var cur=current();
    box.innerHTML=srcs.map(function(src){
      var list=parts.filter(function(p){return p.parent===src.id});
      return '<div class="grp"><b>'+esc(src.name)+'</b><span class="mono">'+list.length+' clips · from '+(fmtDur(src.duration)||'')+' source</span>'+
        (src.zip?'<a class="mini" href="'+esc(src.zip)+'">Download all (.zip)</a>':'')+'</div><div class="lib-grid">'+list.map(function(p){
        var age=p.born?Date.now()-p.born:9999,fresh=age<450;
        return '<div class="tcol'+(fresh?' pop':'')+'"'+(fresh?' style="animation-delay:-'+age+'ms"':'')+'>'+
          '<button class="vtile'+(cur&&p.id===cur.id?' on':'')+'" type="button" data-sel="'+p.id+'" data-clip="1" aria-label="Open '+esc(p.name)+'">'+
          '<video src="'+esc(p.url)+'#t=0.1" muted loop playsinline preload="metadata"></video>'+
          '<span class="plat" data-plat="'+p.id+'" title="Change platform">'+esc(p.platform)+'</span>'+
          (p.score!=null?'<span class="score"><small>ENERGY</small><b>'+p.score+'</b></span>':'')+
          '<span class="vov"><b>'+esc(p.title)+'</b><span class="mono">'+fmtRange(p.srcStart,p.srcEnd)+' · '+Math.round(p.duration)+'s</span></span></button>'+
          '<div class="tact"><a class="mini o" href="'+esc(p.dl)+'" download>Download</a><button class="mini" data-act="bill" data-id="'+p.id+'" type="button">Bill</button><button class="mini ghost" data-act="rm" data-id="'+p.id+'" type="button">Remove</button></div></div>';
      }).join('')+'</div>';
    }).join('');
  }
  function startClip(c){
    if(!c||c.state==='working')return;
    if(c.uploading||c.importing){toast('Wait for the upload to finish.');return}
    if(!c.sid){toast('Upload the video file to clip it.');return}
    if(!server.ffmpeg){toast('The server cannot clip right now because ffmpeg is missing.');return}
    parts=parts.filter(function(p){return p.parent!==c.id});
    c.state='working';c.note='';c.cp=4;c.stage='Starting';c.zip=null;focusId=c.id;refresh();
    api('/api/clip',{method:'POST',body:{sourceId:c.sid,count:opts.n,length:opts.len,format:opts.fmt}})
      .then(function(r){c.jobId=r.jobId;pollJob(c)})
      .catch(function(e){c.state='';refresh();toast(e.message||'Could not clip this video.')});
  }
  function pollJob(c){
    var shown=0;
    (function tick(){
      api('/api/jobs/'+c.jobId).then(function(j){
        setCP(c,j.progress,j.stage);
        var added=false;
        while(shown<j.clips.length){
          var part=makePart(c,j.clips[shown],true);
          parts.push(part);
          if(shown===0)sel=part.id;
          shown++;added=true;
        }
        if(added){renderResults();renderStats();if(shown===j.clips.length&&shown===1)renderPhones()}
        if(j.status==='working'){setTimeout(tick,600);return}
        c.state='';
        if(j.status==='error'){refresh();toast(j.error||'Could not clip this video.');return}
        c.note=j.note||'';c.zip=j.zip;
        refresh();
        toast(j.clips.length+(j.clips.length===1?' clip':' clips')+' ready');
        var rs=$('#results');
        if(rs&&!$('#view-clips').hidden)rs.scrollIntoView({behavior:calm?'auto':'smooth',block:'start'});
      }).catch(function(){c.state='';refresh();toast('Lost contact with the server.')});
    })();
  }
  function gridClick(e){
    var pl=e.target.closest('[data-plat]');
    if(pl){var c0=findAny(pl.getAttribute('data-plat'));if(c0){c0.platform=PLATS[(PLATS.indexOf(c0.platform)+1)%PLATS.length];refresh()}return}
    var b=e.target.closest('button[data-act]');
    if(b){
      var id=b.getAttribute('data-id'),act=b.getAttribute('data-act'),c=findAny(id);
      if(act==='rm'){
        if(parts.some(function(p){return p.id===id}))parts=parts.filter(function(p){return p.id!==id});
        else{
          var s0=srcOf(id);
          if(s0&&s0.sid)api('/api/uploads/'+s0.sid,{method:'DELETE'}).catch(function(){});
          clips=clips.filter(function(x){return x.id!==id});parts=parts.filter(function(p){return p.parent!==id});
        }
        if(sel&&!findAny(sel))sel=null;
        if(focusId&&!srcOf(focusId))focusId=null;
        refresh();
      }else if(act==='clip'){focusId=id;startClip(c)}
      else if(c){pushClipItems([c]);toast('Added to invoice');location.hash='#invoices'}
      return;
    }
    var s=e.target.closest('[data-sel]');
    if(s){sel=s.getAttribute('data-sel');refresh();if(window.innerWidth<=900)$('#phones').scrollIntoView({behavior:'smooth',block:'center'})}
  }
  $('#libgrid').addEventListener('click',gridClick);
  var rg=$('#resgrid');
  rg.addEventListener('click',gridClick);
  rg.addEventListener('mouseover',function(e){
    var t=e.target.closest('.vtile[data-clip]');
    if(!t||(e.relatedTarget&&t.contains(e.relatedTarget)))return;
    var v=t.querySelector('video');if(!v)return;
    var pr=v.play();if(pr&&pr.catch)pr.catch(function(){});
  });
  rg.addEventListener('mouseout',function(e){
    var t=e.target.closest('.vtile[data-clip]');
    if(!t||(e.relatedTarget&&t.contains(e.relatedTarget)))return;
    var v=t.querySelector('video');
    if(v){v.pause();try{v.currentTime=0.1}catch(x){}}
  });
  rg.addEventListener('loadedmetadata',function(e){
    var v=e.target;
    if(v&&v.closest&&v.closest('.vtile[data-clip]')){try{v.currentTime=0.1}catch(x){}}
  },true);
  $('#clipbar').addEventListener('click',function(e){
    if(e.target.closest('#cb-clip'))startClip(srcOf(focusId)||clips[0]);
  });
  $('#res-invoice').addEventListener('click',function(){pushClipItems(parts);location.hash='#invoices'});
  $('#opt-auto').checked=opts.auto;$('#opt-n').value=String(opts.n);$('#opt-len').value=String(opts.len);$('#opt-fmt').value=opts.fmt;
  function saveOpts(){
    opts.auto=$('#opt-auto').checked;opts.n=+$('#opt-n').value;opts.len=+$('#opt-len').value;opts.fmt=$('#opt-fmt').value;
    try{localStorage.setItem('clippng.opts',JSON.stringify(opts))}catch(e){}
    renderClipbar();
    if(opts.auto){var c=srcOf(focusId)||clips[0];if(c&&c.sid&&!c.uploading&&!c.importing&&!c.state&&!parts.some(function(p){return p.parent===c.id}))startClip(c)}
  }
  ['#opt-auto','#opt-n','#opt-len','#opt-fmt'].forEach(function(q){$(q).addEventListener('change',saveOpts)});
  function pushClipItems(list){
    list.forEach(function(c){
      if(inv.items.some(function(i){return i.clipId===c.id}))return;
      inv.items.push({id:uid(),clipId:c.id,desc:'Short-form edit: '+c.name,qty:1,rate:500});
    });
    renderItems();renderPreview();
  }

  /* ----- invoice ----- */
  function get(path){return path.split('.').reduce(function(o,k){return o[k]},inv)}
  function set(path,val){var p=path.split('.'),k=p.pop(),o=p.reduce(function(o,k){return o[k]},inv);o[k]=val}
  function fillForm(){
    document.querySelectorAll('[data-b]').forEach(function(el){el.value=get(el.getAttribute('data-b'))});
    renderItems();renderPreview();
  }
  function moneyIn(cur,n){
    try{return new Intl.NumberFormat(cur==='INR'?'en-IN':'en-US',{style:'currency',currency:cur}).format(n||0)}catch(e){return (n||0).toFixed(2)}
  }
  function money(n){return moneyIn(inv.currency,n)}
  function totals(){
    var sub=inv.items.reduce(function(s,i){return s+(+i.qty||0)*(+i.rate||0)},0);
    var disc=sub*(+inv.discount||0)/100,base=sub-disc,tax=base*(+inv.taxRate||0)/100;
    return {sub:sub,disc:disc,tax:tax,total:base+tax};
  }
  function renderItems(){
    $('#items').innerHTML='<div class="item head"><span>Description</span><span>Qty</span><span>Rate</span><span style="text-align:right">Amount</span><span></span></div>'+
    inv.items.map(function(i){
      return '<div class="item" data-id="'+i.id+'"><input class="d" data-k="desc" value="'+esc(i.desc)+'" aria-label="Description">'+
        '<input class="q" data-k="qty" type="number" min="0" step="1" value="'+esc(i.qty)+'" aria-label="Quantity">'+
        '<input class="r" data-k="rate" type="number" min="0" step="any" value="'+esc(i.rate)+'" aria-label="Rate">'+
        '<span class="amt">'+money((+i.qty||0)*(+i.rate||0))+'</span>'+
        '<button class="x" type="button" data-rm="'+i.id+'" aria-label="Remove item">✕</button></div>';
    }).join('');
  }
  function renderPreview(){
    var t=totals();
    var rows=inv.items.filter(function(i){return i.desc||i.rate}).map(function(i){
      return '<tr><td>'+esc(i.desc)+'</td><td>'+esc(i.qty)+'</td><td>'+money(+i.rate)+'</td><td>'+money((+i.qty||0)*(+i.rate||0))+'</td></tr>';
    }).join('');
    $('#paper').innerHTML=
      '<div class="top"><div><h2>INVOICE</h2><div class="no">'+esc(inv.number)+'</div></div>'+
      '<div class="who" style="text-align:right"><b>'+esc(inv.from.name)+'</b><span>'+esc(inv.from.email)+'</span></div></div>'+
      '<div class="two"><div class="who"><div class="lbl">From</div><b>'+esc(inv.from.name)+'</b><span>'+esc(inv.from.addr)+'</span></div>'+
      '<div class="who"><div class="lbl">Billed to</div><b>'+esc(inv.to.name)+'</b><span>'+esc(inv.to.email)+'\n'+esc(inv.to.addr)+'</span></div></div>'+
      '<div class="two"><div class="who"><div class="lbl">Issued</div><b>'+esc(fmtDate(inv.issue))+'</b></div><div class="who"><div class="lbl">Due</div><b>'+esc(fmtDate(inv.due))+'</b></div></div>'+
      '<div class="tbl-scroll"><table><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>'+(rows||'<tr><td colspan="4" style="color:var(--paper-muted)">No items yet</td></tr>')+'</tbody></table></div>'+
      '<div class="tot"><div><span>Subtotal</span><span>'+money(t.sub)+'</span></div>'+
      (+inv.discount?'<div><span>Discount ('+esc(inv.discount)+'%)</span><span>−'+money(t.disc)+'</span></div>':'')+
      (+inv.taxRate?'<div><span>'+esc(inv.taxLabel||'Tax')+' ('+esc(inv.taxRate)+'%)</span><span>'+money(t.tax)+'</span></div>':'')+
      '<div class="grand"><span>Total</span><span>'+money(t.total)+'</span></div></div>'+
      (inv.notes?'<div class="note">'+esc(inv.notes)+'</div>':'');
  }
  document.querySelectorAll('[data-b]').forEach(function(el){
    var h=function(){
      var v=el.value;if(el.type==='number')v=v===''?0:+v;
      set(el.getAttribute('data-b'),v);
      if(el.getAttribute('data-b')==='currency')renderItems();
      renderPreview();
    };
    el.addEventListener('input',h);el.addEventListener('change',h);
  });
  $('#items').addEventListener('input',function(e){
    var row=e.target.closest('.item[data-id]');if(!row)return;
    var it=inv.items.filter(function(i){return i.id===row.getAttribute('data-id')})[0];if(!it)return;
    var k=e.target.getAttribute('data-k');it[k]=k==='desc'?e.target.value:(e.target.value===''?0:+e.target.value);
    $('.amt',row).textContent=money((+it.qty||0)*(+it.rate||0));renderPreview();
  });
  $('#items').addEventListener('click',function(e){
    var b=e.target.closest('[data-rm]');if(!b)return;
    inv.items=inv.items.filter(function(i){return i.id!==b.getAttribute('data-rm')});renderItems();renderPreview();
  });
  $('#add-item').addEventListener('click',function(){inv.items.push({id:uid(),desc:'',qty:1,rate:0});renderItems();renderPreview();var l=document.querySelectorAll('#items .d');if(l.length)l[l.length-1].focus()});
  $('#add-clips').addEventListener('click',function(){var src=parts.length?parts:clips;if(!src.length){toast('Upload a clip first');return}pushClipItems(src);toast('Clips added as line items')});
  $('#new-inv').addEventListener('click',function(){inv=blankInvoice(nextNo());fillForm();toast('New invoice ready')});

  function renderSaved(){
    renderStats();
    var box=$('#saved');
    if(!saved.length){box.innerHTML='<div class="empty">Saved invoices appear here with their payment status.</div>';return}
    box.innerHTML=saved.map(function(s,idx){
      var sub=s.inv.items.reduce(function(a,i){return a+(+i.qty||0)*(+i.rate||0)},0);
      var base=sub-sub*(+s.inv.discount||0)/100,total=base+base*(+s.inv.taxRate||0)/100;
      return '<div class="r"><div style="min-width:0"><b>'+esc(s.inv.number)+' · '+esc(s.inv.to.name)+'</b><small>Due '+esc(fmtDate(s.inv.due))+'</small></div>'+
        '<span style="font-variant-numeric:tabular-nums;font-weight:700">'+moneyIn(s.inv.currency,total)+'</span>'+
        '<button class="pillst '+s.status+'" data-st="'+idx+'" type="button" title="Change status">'+s.status+'</button>'+
        '<span style="display:flex;gap:6px"><button class="mini" data-open="'+idx+'" type="button">Open</button><button class="mini ghost" data-del="'+idx+'" type="button">Delete</button></span></div>';
    }).join('');
  }
  $('#save-inv').addEventListener('click',function(){
    api('/api/invoices',{method:'POST',body:inv}).then(function(rec){
      var i=-1;saved.forEach(function(s,n){if(s.id===rec.id)i=n});
      if(i>=0)saved[i]=rec;else saved.unshift(rec);
      renderSaved();toast('Invoice saved');
    }).catch(function(e){toast(e.message)});
  });
  $('#saved').addEventListener('click',function(e){
    var b=e.target.closest('button');if(!b)return;
    var idx=+(b.getAttribute('data-st')||b.getAttribute('data-open')||b.getAttribute('data-del'));
    var s=saved[idx];if(!s)return;
    if(b.hasAttribute('data-st')){
      var next={Draft:'Sent',Sent:'Paid',Paid:'Draft'}[s.status];
      api('/api/invoices/'+s.id,{method:'PATCH',body:{status:next}}).then(function(rec){saved[idx]=rec;renderSaved()}).catch(function(err){toast(err.message)});
    }else if(b.hasAttribute('data-open')){
      inv=JSON.parse(JSON.stringify(s.inv));
      inv.items.forEach(function(i){i.id=uid()});
      fillForm();window.scrollTo(0,0);
    }else if(b.hasAttribute('data-del')){
      api('/api/invoices/'+s.id,{method:'DELETE'}).then(function(){saved.splice(idx,1);renderSaved()}).catch(function(err){toast(err.message)});
    }
  });
  $('#pdf-inv').addEventListener('click',function(){
    fetch('/api/invoices/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(inv)})
      .then(function(r){if(!r.ok)throw new Error('Could not make the PDF.');return r.blob()})
      .then(function(blob){
        var a=document.createElement('a');a.href=URL.createObjectURL(blob);
        a.download=String(inv.number||'invoice').replace(/[^\w.-]+/g,'_')+'.pdf';
        document.body.appendChild(a);a.click();a.remove();
        setTimeout(function(){URL.revokeObjectURL(a.href)},4000);
        toast('PDF downloaded');
      }).catch(function(err){toast(err.message)});
  });
  $('#copy-inv').addEventListener('click',function(){
    var t=totals();
    var txt=['INVOICE '+inv.number,'From: '+inv.from.name,'To: '+inv.to.name,'Issued: '+fmtDate(inv.issue)+'  Due: '+fmtDate(inv.due),''].concat(
      inv.items.map(function(i){return i.desc+' — '+i.qty+' × '+money(+i.rate)+' = '+money((+i.qty||0)*(+i.rate||0))}),
      ['','Subtotal: '+money(t.sub),(inv.taxLabel||'Tax')+': '+money(t.tax),'Total: '+money(t.total)]).join('\n');
    var fail=function(){toast('Copy was blocked. Select the invoice text instead.')};
    try{navigator.clipboard.writeText(txt).then(function(){toast('Invoice copied')},fail)}catch(e){fail()}
  });

  /* ----- earnings calculator ----- */
  var REG={'USA/Canada':16,'UK/Australia':12,'Europe':9,'Middle East':7,'SE Asia':3,'LATAM':3.5,'India':2,'Global mix':6};
  var PM={Shorts:1,Reels:.8,X:.6,TikTok:.7};
  var VIEWS_=[50000,100000,250000,500000,1000000,2000000,5000000];
  var VLAB=['50K','100K','250K','500K','1M','2M','5M'];
  var calc={plat:'Shorts',reg:'USA/Canada',vi:4,clips:15};
  var usd=function(n){return '$'+Math.round(n).toLocaleString('en-US')};
  function chipsHTML(obj,key,cls){return Object.keys(obj).map(function(k){return '<button class="chip'+(calc[key]===k?' on':'')+'" type="button" data-k="'+esc(k)+'" aria-pressed="'+(calc[key]===k)+'">'+esc(k)+'</button>'}).join('')}
  function setP(el){var min=+el.min,max=+el.max;el.style.setProperty('--p',((+el.value-min)/(max-min)*100)+'%')}
  function renderCalc(){
    $('#c-plat').innerHTML=chipsHTML(PM,'plat');
    $('#c-reg').innerHTML=chipsHTML(REG,'reg');
    var views=VIEWS_[calc.vi],rate=REG[calc.reg]*PM[calc.plat],per=views/100000*rate,total=per*calc.clips;
    $('#v-views').textContent=VLAB[calc.vi];
    $('#v-clips').textContent=calc.clips+(calc.clips===1?' clip':' clips');
    setP($('#rng-views'));setP($('#rng-clips'));
    $('#r-range').textContent=usd(total*.7)+' – '+usd(total*1.3);
    $('#r-sub').textContent=calc.clips+' clips · '+VLAB[calc.vi]+' avg views each · '+calc.reg+' · '+calc.plat;
    var tier=calc.clips<8?'Starter':(calc.clips<20?'Growth':'Scale');
    $('#r-rows').innerHTML=
      '<div><span>Estimated per clip (midpoint)</span><span>'+usd(per)+'</span></div>'+
      '<div><span>Views per clip</span><span>'+views.toLocaleString('en-US')+'</span></div>'+
      '<div><span>Rate used (per 100K views)</span><span>$'+(Math.round(rate*100)/100)+'</span></div>'+
      '<div><span>Clips per month</span><span>'+calc.clips+'</span></div>'+
      '<div><span>Audience region</span><span>'+esc(calc.reg)+'</span></div>'+
      '<div class="t"><span>Midpoint monthly total</span><span>'+usd(total)+'</span></div>'+
      '<div><span>Volume tier</span><span class="tag">'+tier+'</span></div>';
  }
  $('#c-plat').addEventListener('click',function(e){var b=e.target.closest('[data-k]');if(b){calc.plat=b.getAttribute('data-k');renderCalc()}});
  $('#c-reg').addEventListener('click',function(e){var b=e.target.closest('[data-k]');if(b){calc.reg=b.getAttribute('data-k');renderCalc()}});
  $('#rng-views').addEventListener('input',function(e){calc.vi=+e.target.value;renderCalc()});
  $('#rng-clips').addEventListener('input',function(e){calc.clips=+e.target.value;renderCalc()});
  $('#bill-est').addEventListener('click',function(){
    var per=VIEWS_[calc.vi]/100000*REG[calc.reg]*PM[calc.plat];
    inv=blankInvoice(nextNo());
    inv.currency='USD';inv.taxRate=0;inv.taxLabel='Tax';
    inv.items=[{id:uid(),desc:'Short-form clips for '+calc.plat+' ('+calc.clips+' per month)',qty:calc.clips,rate:Math.round(per)}];
    fillForm();toast('Estimate added to a new invoice');location.hash='#invoices';
  });

  function restore(lib){
    if(clips.length)return;
    var latest={};
    (lib.jobs||[]).forEach(function(j){if(!latest[j.sourceId])latest[j.sourceId]=j});
    (lib.uploads||[]).forEach(function(u){
      var c={id:uid(),kind:'file',name:u.name,size:u.size,url:u.url,sid:u.id,duration:u.duration,dl:u.download,progress:100,platform:'SHORTS',reel:Math.floor(Math.random()*4),born:0};
      clips.push(c);
      var j=latest[u.id];
      if(j){c.jobId=j.id;c.zip=j.zip;c.note=j.note||'';j.clips.forEach(function(jc){parts.push(makePart(c,jc,false))})}
    });
    if(clips.length){
      focusId=clips[0].id;
      var first=parts.filter(function(p){return p.parent===clips[0].id})[0];
      sel=first?first.id:clips[0].id;
      refresh();
    }
  }
  function loadAll(){
    api('/api/health').then(function(h){server=h;if(!h.ffmpeg)toast('ffmpeg is missing on the server, so clipping is off.')}).catch(function(){});
    api('/api/invoices').then(function(list){saved=list;inv=blankInvoice(nextNo());fillForm();renderSaved()}).catch(function(){});
    api('/api/library').then(restore).catch(function(){});
  }
  route();refresh();fillForm();renderSaved();renderCalc();loadAll();
})();

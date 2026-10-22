import json, os, re, subprocess, urllib.request, urllib.parse, html, struct, sys
UA={"User-Agent":"banyan-sound-picker/1.0"}
get=lambda u: urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60).read()
C = {  # sound id -> [(source, ref, seconds)]
 "bark":[("bsb","1061",1.6),("bsb","2955",1.6),("bsb","2352",1.6)],
 "moo":[("bsb","2386",2.2),("bsb","2385",2.2)],
 "crow":[("bsb","0956",1.8),("bsb","3463",1.8),("bsb","3465",1.8)],
 "rooster":[("bsb","0440",2.8),("bsb","0441",2.8)],
 "footsteps":[("bsb","0510",2.0),("bsb","0137",2.0)],
 "door":[("bsb","3205",2.2),("bsb","1703",2.2)],
 "splash":[("bsb","1529",1.3),("bsb","1531",1.3),("bsb","1521",1.5)],
 "gulp":[("bsb","0352",0.9),("bsb","0353",0.9),("bsb","3247",1.2)],
 "munch":[("bsb","1114",1.5),("bsb","1594",1.5)],
 "yawn":[("bsb","1406",2.4),("bsb","1407",2.4)],
 "snore":[("bsb","1810",2.4),("bsb","1070",2.4)],
 "giggle":[("bsb","1420",2.0),("bsb","1418",2.0),("bsb","0232",2.0)],
 "cheer":[("bsb","0237",2.6),("bsb","0236",2.6)],
 "clap":[("bsb","2363",2.2),("bsb","0814",2.2)],
 "market":[("bsb","2728",3.0),("bsb","3349",3.0)],
 "cart":[("bsb","2519",2.5),("bsb","1316",2.5)],
 "boing":[("bsb","2284",1.3),("bsb","2278",1.3)],
 "monkey":[("commons","File:Hylobates syndactylus calling 3588.ogg",2.2)],
}
os.makedirs("cand",exist_ok=True); os.makedirs("raw2",exist_ok=True)
meta={}
def pcm(path):
    raw=subprocess.run(["ffmpeg","-v","error","-i",path,"-ac","1","-ar","8000","-f","s16le","-"],capture_output=True,check=True).stdout
    return struct.unpack(f"<{len(raw)//2}h",raw)
def pick(path, secs):
    x=pcm(path); fr=160  # 20 ms frames at 8 kHz
    e=[sum(v*v for v in x[i:i+fr])/fr for i in range(0,len(x)-fr,fr)]
    n=max(1,int(secs/0.02))
    if len(e)<=n: return 0.0
    s=sum(e[:n]); best=(s,0)
    for i in range(1,len(e)-n): s+=e[i+n-1]-e[i-1]; best=max(best,(s,i))
    i=best[1]; peak=max(e[i:i+n]) or 1
    while i>0 and e[i-1]>peak*0.001 and best[1]-i<25: i-=1   # back up to the onset (<=0.5 s)
    return i*0.02
for sid, srcs in C.items():
    for k,(kind,ref,secs) in enumerate(srcs):
        tag=f"{sid}__{k}"
        try:
            if kind=="bsb":
                url=f"https://bigsoundbank.com/sound-s{ref}.html"
                ptxt=html.unescape(re.sub(r"<[^>]+>"," ",get(url).decode("utf8","ignore")))
                if "Free and Royalty Free" not in ptxt: print("SKIP not free", tag); continue
                title=re.search(r"<title>([^<]+)",get(url).decode("utf8","ignore")).group(1).strip()
                path=None
                for ext in ("flac","wav","mp3"):  # older sounds have no FLAC original
                    p2=f"raw2/{ref}.{ext}"
                    if os.path.exists(p2): path=p2; break
                    try:
                        data=get(f"https://bigsoundbank.com/UPLOAD/{ext}/{ref}.{ext}")
                        if data[:15].lower().startswith((b"<!doctype", b"<html")): continue  # a redirect to a web page, not audio
                        open(p2,"wb").write(data); path=p2; break
                    except Exception: pass
                if not path: raise RuntimeError("no downloadable file")
                src={"source":url,"license":"CC0 1.0 (BigSoundBank, Free and Royalty Free)","author":"Joseph Sardin, BigSoundBank.com","title":title}
            else:
                q=urllib.parse.urlencode({"action":"query","titles":ref,"prop":"imageinfo","iiprop":"url|extmetadata","format":"json"})
                ii=next(iter(json.loads(get("https://commons.wikimedia.org/w/api.php?"+q))["query"]["pages"].values()))["imageinfo"][0]
                lic=re.sub("<[^>]+>","",ii["extmetadata"]["LicenseShortName"]["value"])
                path="raw2/"+re.sub(r"\W","_",ref)+os.path.splitext(urllib.parse.urlparse(ii["url"]).path)[1]
                if not os.path.exists(path): open(path,"wb").write(get(ii["url"]))
                src={"source":ii["descriptionurl"],"license":lic,"author":re.sub("<[^>]+>","",ii["extmetadata"].get("Artist",{}).get("value",""))[:100],"title":ref}
            start=pick(path,secs)
            subprocess.run(["ffmpeg","-v","error","-y","-ss",f"{start:.2f}","-t",str(secs),"-i",path,"-af",f"afade=t=in:d=0.02,afade=t=out:st={secs-0.18:.2f}:d=0.18,loudnorm=I=-16:TP=-1.5:LRA=11","-ac","1","-ar","48000","-c:a","libopus","-b:a","64k",f"cand/{tag}.ogg"],check=True)
            meta[tag]={**src,"sid":sid,"cut":[round(start,2),secs],"ref":ref,"kind":kind}
            print("ok",tag,round(start,2),src["title"][:50])
        except Exception as ex:
            print("FAIL",tag,ex)
json.dump(meta,open("cand.json","w"),indent=1)

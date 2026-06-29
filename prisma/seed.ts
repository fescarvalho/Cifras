import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const seedSongs = [
  {
    title: "Senhor, Tende Piedade de Nós",
    artist: "Litúrgico",
    originalKey: "Am",
    part: "PERDAO" as const,
    season: "TEMPO_COMUM" as const,
    content: `[Intro]
Am   F   G   C   E7

[Estrofe 1]
Am            Dm
Senhor, tende piedade de nós.
G             C        E7
Senhor, tende piedade de nós.

[Estrofe 2]
F            Dm
Cristo, tende piedade de nós.
G            C        E7
Cristo, tende piedade de nós.

[Estrofe 3]
Am            Dm
Senhor, tende piedade de nós.
F      G      Am
Senhor, tende piedade de nós.`
  },
  {
    title: "Glória a Deus nas Alturas",
    artist: "Ministério de Música",
    originalKey: "G",
    part: "GLORIA" as const,
    season: "TEMPO_COMUM" as const,
    content: `[Intro]
G   D   C   D

[Refrão]
G         D           C          D
Glória a Deus nas alturas, e paz na terra
G         D         C   D
Aos homens por Ele amados.

[Estrofe 1]
G          D             C           D
Senhor Deus, Rei dos céus, Deus Pai todo-poderoso
C          Am           D          D7
Nós vos louvamos, nós vos bendizemos.
G          D          C          D
Nós vos adoramos, nós vos glorificamos.`
  },
  {
    title: "Buscai Primeiro",
    artist: "Aclamação",
    originalKey: "C",
    part: "ACLAMACAO" as const,
    season: "TEMPO_COMUM" as const,
    content: `[Intro]
C   G/B   Am   Em   F   C   G   G7

[Estrofe 1]
C     G/B      Am      Em
Buscai primeiro o Reino de Deus
F     C         G    G7
E a sua justiça.
C        G/B        Am        Em
E tudo o mais vos será acrescentado.
F      C    G  C
Alelu, aleluia!

[Refrão]
C   G/B   Am   Em   F   C   G   C
Aleluia,  aleluia,  aleluia, alelu, aleluia!`
  },
  {
    title: "Este Prato de Pão",
    artist: "Ofertório",
    originalKey: "D",
    part: "OFERTORIO" as const,
    season: "TEMPO_COMUM" as const,
    content: `[Intro]
D   A   G   D   A7

[Estrofe 1]
D           F#m
Este prato de pão, este cálice de vinho
G              D          A
Nós vos oferecemos, Senhor Jesus.
D                 F#m
Fruto da terra e do nosso trabalho
G             Em          A   A7
Que se tornará vosso Corpo e vosso Sangue.

[Refrão]
G         A       D       Bm
Recebei, Senhor, nossa oferta
G         A          D     D7
E transformai nossa vida em amor.
G         A       D       Bm
Recebei, Senhor, nossa oferta
G         A          D
E transformai nossa vida em amor.`
  },
  {
    title: "Santo é o Senhor",
    artist: "Litúrgico",
    originalKey: "E",
    part: "SANTO" as const,
    season: "TEMPO_COMUM" as const,
    content: `[Intro]
E   A   B7   E

[Refrão]
E      A        B7   E
Santo, Santo, Santo é o Senhor!
E      A        B7   E
Deus do universo, terra e céus.

[Estrofe 1]
C#m                  G#m
Cheios estão da vossa glória.
A                 F#m          B7
Hosana nas alturas, hosana nas alturas!
E         A         B7       E
Bendito o que vem em nome do Senhor.
C#m                  G#m
Hosana nas alturas, hosana nas alturas.
A         B7        E
Hosana nas alturas, Senhor!`
  },
  {
    title: "Cordeiro de Deus",
    artist: "Litúrgico",
    originalKey: "F",
    part: "CORDEIRO" as const,
    season: "TEMPO_COMUM" as const,
    content: `[Intro]
F   Dm   Bb   C7

[Estrofe 1]
F           Dm           Bb             C7
Cordeiro de Deus, que tirais o pecado do mundo
Gm          C7       Am    Dm
Tende piedade, tende piedade de nós.
F           Dm           Bb             C7
Cordeiro de Deus, que tirais o pecado do mundo
Gm          C7       Am    Dm
Tende piedade, tende piedade de nós.

[Estrofe 2]
Bb          C        Am         Dm
Cordeiro de Deus, que tirais o pecado do mundo
Gm          C7        F
Dai-nos a paz, dai-nos a paz.`
  },
  {
    title: "Como és Lindo",
    artist: "Vida Reluz",
    originalKey: "A",
    part: "COMUNHAO" as const,
    season: "TEMPO_COMUM" as const,
    content: `[Intro]
A   E/G#   F#m   C#m   D   A/C#   Bm7   E7

[Estrofe 1]
A         E/G#        F#m            C#m
Olhar para o teu rosto e ver o brilho do teu amor
D             A/C#     Bm7              E7
Sentir a tua presença aquecer o meu coração.
A           E/G#         F#m             C#m
Saber que estás comigo, no altar a se entregar a mim
D          A/C#            Bm7        E7
Em forma de pão e vinho, o mistério da salvação.

[Refrão]
A            E/G#      F#m         C#m
Como és lindo, meu Senhor, como és lindo no altar!
D         A/C#       Bm7          E7
Quero te amar para sempre, em ti me abrigar.
A            E/G#      F#m         C#m
Como és lindo, meu Senhor, como és lindo no altar!
D         A/C#          Bm7    E7   A
Minha alma se alegra em ti, e quer te louvar.`
  }
];

async function main() {
  console.log("Starting database seeding...");
  
  // Clear existing songs
  await prisma.song.deleteMany();
  await prisma.setlistSong.deleteMany();
  await prisma.setlist.deleteMany();
  
  for (const songData of seedSongs) {
    const song = await prisma.song.create({
      data: songData,
    });
    console.log(`Created song: ${song.title} (${song.part})`);
  }
  
  // Seed a sample setlist
  const setlist = await prisma.setlist.create({
    data: {
      title: "Missa de Domingo (Tempo Comum)",
      date: new Date(),
    }
  });
  console.log(`Created sample setlist: ${setlist.title}`);
  
  // Fetch a couple songs to associate with the setlist
  const songs = await prisma.song.findMany({
    take: 3
  });
  
  for (let i = 0; i < songs.length; i++) {
    await prisma.setlistSong.create({
      data: {
        setlistId: setlist.id,
        songId: songs[i].id,
        order: i + 1
      }
    });
    console.log(`Added song to setlist: ${songs[i].title} at order ${i + 1}`);
  }

  console.log("Seeding finished successfully!");
  await prisma.$disconnect();
  await pool.end();
}

main()
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });

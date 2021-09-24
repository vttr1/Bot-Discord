const Discord = require('discord.js');
const ytdl = require('ytdl-core');
const configs = require('./config.json');
const google = require('googleapis');
const fs = require('fs');

const youtube = new google.youtube_v3.Youtube({
    version: 'v3',
    auth: configs.GOOGLE_KEY
});
const client = new Discord.Client();

const prefixo = configs.PREFIX;

const servidores = [];

client.on("guildCreate", (guild) => {
    console.log('Id da guilda onde eu entrei: ' + guild.id);
    console.log('Nome da guilda onde eu entrei: ' + guild.name);

    servidores[guild.id] = {
        connection: null,
        dispatcher: null,
        fila: [],
        estouTocando: false
    }

    saveServer(guild.id);
})

client.on("ready", () => {
    loadServers();
    console.log('Estou online!')
});

client.on("message", async (msg) => {

    // filtro
    if(!msg.guild) return;

    if(!msg.content.startsWith(prefixo)) return;

    if(!msg.member.voice.channel) {
        msg.channel.send('Você precisa estar em um canal de voz!');
        return;
    }

    // comandos
    if (msg.content === prefixo + 'join') { //#join
        try {
            servidores[msg.guild.id].connection = await msg.member.voice.channel.join();
        }
        catch (err) {
            console.log('Erro ao entrar num canal de voz!');
            console.log(err);
        }  
    }
    
    if (msg.content === prefixo + 'leave') { //#leave
        msg.member.voice.channel.leave();
        msg.channel.send('**Vlw Flw!** 👋 ');
        servidores[msg.guild.id].connection = null;
        servidores[msg.guild.id].dispatcher = null;
        servidores[msg.guild.id].estouTocando = false;
        servidores[msg.guild.id].fila = [];
    }

    if (msg.content.startsWith(prefixo + 'play')) { //#play <link>
        let oQueTocar = msg.content.slice(6);

        if (oQueTocar.length === 0) {
            msg.channel.send('Eu preciso de algo para tocar!');
            return;
        }

        if (servidores[msg.guild.id].connection === null) {
            try {
                servidores[msg.guild.id].connection = await msg.member.voice.channel.join();
            }
            catch (err) {
                console.log('Erro ao entrar num canal de voz!');
                console.log(err);
            }
        }

        if (ytdl.validateURL(oQueTocar)) {
            servidores[msg.guild.id].fila.push(oQueTocar);
            console.log('Adicionado:' + oQueTocar);
            tocaMusicas(msg);
        }
        else {
            youtube.search.list({
                q: oQueTocar,
                part: 'snippet',
                fields: 'items(id(videoId),snippet(title, channelTitle))',
                type: 'video'
            }, function (err, resultado){
                if (err) {
                    console.log(err);
                }
                if (resultado) {

                    const listaResultados = [];

                    // orgazina os resultados da pesquisa
                    for (let i in resultado.data.items) {
                        const montaItem = {
                            'tituloVideo': resultado.data.items[i].snippet.title,
                            'nomeCanal': resultado.data.items[i].snippet.channelTitle,
                            'id': 'https://www.youtube.com/watch?v=' + resultado.data.items[i].id.videoId
                        }

                        listaResultados.push(montaItem);
                    }
                    
                    //constroi a mensagem
                    const embed = new Discord.MessageEmbed()
                        .setColor([255,163,51])
                        .setAuthor('Resultados')
                        .setDescription('Escolha sua música de 1️⃣ a 5️⃣!');


                    // add campos para cada resultado da lista    
                    for (let i in listaResultados) {
                        embed.addField(
                            `${parseInt(i) + 1}: ${listaResultados[i].tituloVideo}`,
                            listaResultados[i].nomeCanal
                        );
                    }
                    msg.channel.send(embed).
                        then((embedMessage) => {
                            const possiveisReacoes = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

                            //reage na mensagem para cada emoji que escolhemos
                            for(let i = 0; i < possiveisReacoes.length; i++){
                                embedMessage.react(possiveisReacoes[i]);
                            }

                            const filter = (reaction, user) => {
                                return possiveisReacoes.includes(reaction.emoji.name) 
                                    && user.id === msg.author.id;
                            }

                            embedMessage.awaitReactions(filter, { max: 1, time: 10000, errors: ['time']})
                                .then((collected) => {
                                    const reaction = collected.first();
                                    const idOpcaoEscolhida = possiveisReacoes.indexOf(reaction.emoji.name);
                                    embedMessage.delete({timeout: 10000}).catch(O_o => {});

                                    msg.channel.send(`**Play ▶️  ${listaResultados[idOpcaoEscolhida].tituloVideo} de ${listaResultados[idOpcaoEscolhida].nomeCanal}**`);
                                    
                                    servidores[msg.guild.id].fila.push(listaResultados[idOpcaoEscolhida].id);
                                    tocaMusicas(msg);
                                })
                                .catch((error) => {
                                    msg.replay('**Você não escolheu uma opção válida!**');
                                    console.log(error);
                                });   
                        });


                }
            });
        }
    }

    if (msg.content === prefixo + 'pause') { // !pause
        servidores[msg.guild.id].dispatcher.pause();
        msg.channel.send('**Música Pausada!** ⏸');
    }

    if (msg.content === prefixo + 'resume') { // !resume
        servidores[msg.guild.id].dispatcher.resume();
        msg.channel.send('**Música Voltou!** ⏯');
    }
    if (msg.content === prefixo + 'skip') { // !skip
        servidores[msg.guild.id].dispatcher.end();
        msg.channel.send('**Música Pulada!** ⏩');
    }

});

const tocaMusicas = (msg) => {
   if (servidores[msg.guild.id].estouTocando === false) {
        const tocando = servidores[msg.guild.id].fila[0];
        servidores[msg.guild.id].estouTocando = true;
        servidores[msg.guild.id].dispatcher = servidores[msg.guild.id].connection.play(ytdl(tocando, configs.YRDL));
    
        servidores[msg.guild.id].dispatcher.on('finish', () => {
            servidores[msg.guild.id].fila.shift();
            servidores[msg.guild.id].estouTocando = false;
            if (servidores[msg.guild.id].fila.length > 0) {
                tocaMusicas(msg);
            }
            else {
                servidores[msg.guild.id].dispatcher = null;
            }
        });
   }
}

const loadServers = () => {
    fs.readFile('serverList.json', 'utf8', (err, data) => {
        if (err) {
            console.log('Erro ao ler registro de servidores');
            console.log(err);
        }  
        else {
            const objLe = JSON.parse(data);
            for (let i in objLe.servers) {
                servidores[objLe.servers[i]] = {
                    connection: null,
                    dispatcher: null,
                    fila: [],
                    estouTocando: false
                }
            }
        }        
    });
}

const saveServer = (idNovoServidor) => {
    fs.readFile('serverList.json', 'utf8', (err, data) => {
        if (err) {
            console.log('Ocorreu um erro ao ler o arquivo para salvar o novo id de server');
            console.log(err);
        }  
        else {
            const objLe = JSON.parse(data);
            objLe.servers.push(idNovoServidor);
            const objEscreve = JSON.stringify(objLe);

            fs.writeFile('serverlist.json', objEscreve, 'utf8', () => {});
        }        
    });
}

client.login(configs.TOKEN_DISCORD);


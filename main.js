const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const cron = require('node-cron');
const http = require('http');
const { google } = require('googleapis');
const { Readable } = require('stream');
const FormData = require('form-data');
const sharp = require('sharp');

const isDev = !app.isPackaged;

if (process.platform === 'win32') {
    app.setAppUserModelId("com.seu-nome.videocreator");
}

let mainWindow, cronJob, authServer;
let sessionHistory = new Set();
let youtubeKeywords = new Set(); // "Banco de dados" de palavras-chave
let isConfigDirty = false;
let forceQuit = false;
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'config.json');

let currentThemesList = [];
let currentRunParams = {};
let stopAfterCurrentTask = false;
let activeFfmpegProcess = null;
let isProcessing = false;

// --- LÓGICA DE CORES PARA THUMBNAIL ---
const ALL_THUMBNAIL_COLORS = ['#FFFFFF', '#39FF14', '#FFFF00', '#FF00FF', '#00BFFF'];
let availableThumbnailColors = [...ALL_THUMBNAIL_COLORS];

function getNextThumbnailColor() {
    if (availableThumbnailColors.length === 0) {
        console.log("Todas as cores de thumbnail foram usadas. Resetando a lista.");
        availableThumbnailColors = [...ALL_THUMBNAIL_COLORS];
    }
    const randomIndex = Math.floor(Math.random() * availableThumbnailColors.length);
    const color = availableThumbnailColors.splice(randomIndex, 1)[0];
    return color;
}
// --- FIM DA LÓGICA DE CORES ---

const PESCADOS_SEARCH_QUERIES = [
    'tilápia+preço+mercado', 'exportação+pescados+brasil', 'importação+frutos+do+mar',
    'crise+pesca+sardinha', 'aquicultura+sustentável', 'legislação+pesca',
    'salmão+chileno+brasil', 'mercado+atum', 'camarão+produção+brasil', ''
];

function getBinaryPath(binaryName) {
    const platform = process.platform;
    if (platform !== 'win32') return isDev ? path.join(__dirname, 'resources', 'bin', binaryName) : path.join(process.resourcesPath, 'bin', binaryName);
    return isDev ? path.join(__dirname, 'resources', 'bin', `${binaryName}.exe`) : path.join(process.resourcesPath, 'bin', `${binaryName}.exe`);
}
const FFMPEG_PATH = getBinaryPath('ffmpeg');
const FFPROBE_PATH = getBinaryPath('ffprobe');
const REDIRECT_URI = 'http://localhost:3000';

function logToRenderer(webContents, message) {
    if (webContents && !webContents.isDestroyed()) webContents.send('log-update', message);
    console.log(message);
}

function secondsToHHMMSS(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    
    return [hours, minutes, seconds]
        .map(val => val.toString().padStart(2, '0'))
        .join(':');
}

function getKenBurnsEffect(duration) {
    const zoomFactor = 1.4; 
    const scaledWidth = Math.round(1920 * zoomFactor);
    const scaledHeight = Math.round(1080 * zoomFactor);
    const out_w = 1920;
    const out_h = 1080;
    const pan_x_max = scaledWidth - out_w;
    const pan_y_max = scaledHeight - out_h;
    const direction = Math.floor(Math.random() * 4);
    let x_expr, y_expr;
    switch (direction) {
        case 0: x_expr = `'(${pan_x_max})*t/${duration}'`; y_expr = `'${pan_y_max}/2'`; break;
        case 1: x_expr = `'(${pan_x_max})*(1-t/${duration})'`; y_expr = `'${pan_y_max}/2'`; break;
        case 2: x_expr = `'${pan_x_max}/2'`; y_expr = `'(${pan_y_max})*t/${duration}'`; break;
        case 3: x_expr = `'${pan_x_max}/2'`; y_expr = `'(${pan_y_max})*(1-t/${duration})'`; break;
        default: x_expr = `'(${pan_x_max})*t/${duration}'`; y_expr = `'${pan_y_max}/2'`; break;
    }
    return `scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=increase,crop=w=${out_w}:h=${out_h}:x=${x_expr}:y=${y_expr}`;
}

const runCommand = (command) => new Promise((resolve, reject) => {
    activeFfmpegProcess = exec(command, (error, stdout, stderr) => {
        activeFfmpegProcess = null;
        if (error) {
            if (error.killed) return reject(new Error("Processo FFmpeg interrompido pelo usuário."));
            reject(new Error(stderr));
        } else {
            resolve(stdout);
        }
    });
});

async function extractFrameFromVideo(videoPath, outputPath, webContents) {
    logToRenderer(webContents, '   - Extraindo um frame do vídeo para usar como base da thumbnail...');
    const frameOutputPath = path.join(outputPath, 'thumbnail_base_frame.jpg');
    try {
        const duration = await getMediaDuration(videoPath);
        let timestamp = '00:00:05'; 

        if (duration > 10) { 
            const minTime = duration * 0.15;
            const maxTime = duration * 0.85;
            const randomTime = Math.random() * (maxTime - minTime) + minTime;
            timestamp = secondsToHHMMSS(randomTime);
            logToRenderer(webContents, `   - Duração do vídeo base: ${duration.toFixed(2)}s. Frame será extraído de um ponto aleatório: ${timestamp}`);
        }

        const command = `"${FFMPEG_PATH}" -ss ${timestamp} -i "${videoPath}" -vframes 1 -q:v 2 -y "${frameOutputPath}"`;
        await runCommand(command);
        logToRenderer(webContents, `   - Frame extraído com sucesso: ${frameOutputPath}`);
        return frameOutputPath;
    } catch (error) {
        logToRenderer(webContents, `   - ❌ ERRO ao extrair frame do vídeo: ${error.message}`);
        return null;
    }
}

async function generateThumbnail(baseImagePath, title, outputPath, webContents, fontColor) {
    logToRenderer(webContents, '   - Gerando thumbnail personalizada...');
    try {
        const width = 1280, height = 720;
        const words = title.split(' ');
        let lines = [], currentLine = words[0];
        for (let i = 1; i < words.length; i++) {
            if (currentLine.length + words[i].length < 30) currentLine += ' ' + words[i];
            else { lines.push(currentLine); currentLine = words[i]; }
        }
        lines.push(currentLine);
        const svgText = `<svg width="${width}" height="${height}"><style>.title{fill:${fontColor};font-size:70px;font-weight:bold;font-family:Arial,sans-serif;text-anchor:middle;paint-order:stroke;stroke:#000000;stroke-width:3px;stroke-linecap:butt;stroke-linejoin:miter;}</style>${lines.map((line,index)=>`<text x="50%" y="${height/2-(lines.length-1)*40+index*80}" class="title">${line}</text>`).join('')}</svg>`;
        const svgBuffer = Buffer.from(svgText);
        await sharp(baseImagePath).resize(width, height).composite([{input:Buffer.from([0,0,0,128]),raw:{width:1,height:1,channels:4},tile:!0,blend:'over'},{input:svgBuffer,top:0,left:0}]).toFile(outputPath);
        logToRenderer(webContents, `   - Thumbnail gerada com sucesso: ${outputPath}`);
        return outputPath;
    } catch (error) {
        logToRenderer(webContents, `   - ❌ ERRO ao gerar thumbnail: ${error.message}`);
        return null;
    }
}

async function generateAiImage(prompt, config, outputPath, webContents, seed = 0) {
    if (!config.stabilityApiKey) {
        logToRenderer(webContents, '   - Chave da API da Stability AI não fornecida. Pulando geração de imagem.');
        return null;
    }
    logToRenderer(webContents, `   - Gerando imagem com IA (Seed: ${seed}). Prompt: "${prompt}"`);
    try {
        const response = await fetch("https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image", { method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json','Authorization':`Bearer ${config.stabilityApiKey}`}, body:JSON.stringify({text_prompts:[{text:prompt,weight:1},{text:'blurry, bad, disfigured, text, watermark',weight:-1}],cfg_scale:7,height:768,width:1344,steps:30,samples:1,style_preset:"cinematic",seed:seed})});
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Erro na API da Stability AI: ${response.status} - ${errorBody}`);
        }
        const responseJSON = await response.json();
        const imageBase64 = responseJSON.artifacts[0].base64;
        const imagePath = path.join(outputPath, `ai_background_${seed}.png`);
        await fs.promises.writeFile(imagePath, Buffer.from(imageBase64, 'base64'));
        logToRenderer(webContents, `   - Imagem de IA gerada com sucesso: ${imagePath}`);
        return imagePath;
    } catch (error) {
        logToRenderer(webContents, `   - ❌ ERRO ao gerar imagem com IA: ${error.message}`);
        return null;
    }
}

async function generateImagePromptsFromScript(script, numPrompts, config, webContents) {
    if (numPrompts <= 0) return [];
    logToRenderer(webContents, `   - Gerando ${numPrompts} prompts de imagem a partir do roteiro...`);
    const prompts = [];
    const scriptLength = script.length;
    const segmentLength = Math.floor(scriptLength / numPrompts);
    for (let i = 0; i < numPrompts; i++) {
        const start = i * segmentLength;
        const end = (i + 1) * segmentLength;
        const segment = script.substring(start, end);
        const geminiPrompt = `Baseado no seguinte trecho de um roteiro em português: "${segment}", crie um prompt curto e descritivo para um gerador de imagens de IA. O prompt deve capturar a cena principal e ser **obrigatoriamente em INGLÊS**. Responda APENAS com o texto do prompt em inglês.`;
        try {
            const imagePromptText = await callGeminiPlainText(config, geminiPrompt, webContents);
            const finalPrompt = `${imagePromptText}, cinematic lighting, digital art, beautiful landscape`;
            prompts.push(finalPrompt);
        } catch (error) {
            logToRenderer(webContents, `   - ❌ ERRO ao gerar prompt de imagem para o segmento ${i + 1}: ${error.message}`);
            prompts.push("a beautiful cinematic landscape, digital art");
        }
    }
    return prompts;
}

async function runFullSequence(webContents) {
    if (isProcessing) {
        logToRenderer(webContents, "AVISO: Uma sequência de vídeos já está em andamento. A nova solicitação foi ignorada.");
        return;
    }
    isProcessing = true;
    if (youtubeKeywords.size === 0 && currentRunParams.config) {
        logToRenderer(webContents, 'Inicializando banco de dados de palavras-chave do YouTube...');
        await checkYouTubeForDuplicates(currentRunParams.config, webContents);
    }

    let themeNames = {'futebol':'Notícias de Futebol','pescados':'Notícias de Pescados','ciencia':'Curiosidades Científicas','historinhas':'Historinhas Infantis','freeform':'Prompt Livre'}
    let themeListForLog = currentThemesList.map(t => themeNames[t] || t).join(', ');
    logToRenderer(webContents, `Iniciando geração da sequência completa: ${themeListForLog}`);
    for (const theme of currentThemesList) {
        if (stopAfterCurrentTask) {
            logToRenderer(webContents, "Sequência interrompida pelo usuário.");
            break; 
        }
        try {
            let runParamsForTheme = { ...currentRunParams, config: { ...currentRunParams.config } };
            if (currentRunParams.config.batchMode) {
                const themeConfigPath = path.join(userDataPath, `${theme}.json`);
                if (fs.existsSync(themeConfigPath)) {
                    try {
                        const themeConfigContent = await fs.promises.readFile(themeConfigPath, 'utf8');
                        const themeConfig = JSON.parse(themeConfigContent);
                        Object.assign(runParamsForTheme.config, themeConfig);
                        logToRenderer(webContents, `   - Modo Lote: Carregada configuração específica de '${theme}.json'.`);
                    } catch (e) {
                        logToRenderer(webContents, `   - AVISO: Falha ao ler ou processar o arquivo de configuração de lote '${theme}.json'. Usando configuração padrão. Erro: ${e.message}`);
                    }
                } else {
                    logToRenderer(webContents, `   - Modo Lote: Arquivo '${theme}.json' não encontrado. Usando configuração padrão.`);
                }
            }
            await runFullProcess(theme, runParamsForTheme, webContents);
        } catch (error) {
            logToRenderer(webContents, `❌ ERRO NO CICLO do tema '${themeNames[theme] || theme}': ${error.message}`);
            webContents.send('automation-error');
        }
    }
    isProcessing = false;
    stopAfterCurrentTask = false;
    if (cronJob) {
        const nextRun = getNextRunDate(cronJob);
        logToRenderer(webContents, `Sequência completa finalizada. Próxima execução agendada: ${nextRun}`);
    } else {
        logToRenderer(webContents, "Sequência completa finalizada.");
    }
}

async function selectMediaByTheme(theme, directoryPath, prefixMap, webContents, fallbackToRandom) {
    if (!directoryPath || !fs.existsSync(directoryPath)) return null;
    try {
        const allFiles = (await fs.promises.readdir(directoryPath)).filter(f => /\.(jpg|jpeg|png|gif|mp4|mov|avi)$/i.test(f));
        if (allFiles.length === 0) return null;
        const prefix = prefixMap[theme];
        if (prefix) {
            const themedFiles = allFiles.filter(f => f.toLowerCase().includes(prefix));
            if (themedFiles.length > 0) {
                const chosenFile = themedFiles[Math.floor(Math.random() * themedFiles.length)];
                logToRenderer(webContents, `   - Mídia temática encontrada: ${chosenFile}`);
                return path.join(directoryPath, chosenFile);
            }
        }
        if (fallbackToRandom) {
            logToRenderer(webContents, `   - Nenhuma mídia com prefixo '${prefix}' encontrada. Usando uma aleatória.`);
            const randomFile = allFiles[Math.floor(Math.random() * allFiles.length)];
            return path.join(directoryPath, randomFile);
        } else {
            logToRenderer(webContents, `   - Nenhuma mídia com prefixo '${prefix}' encontrada. Pulando.`);
            return null;
        }
    } catch (error) {
        logToRenderer(webContents, `   - ERRO ao ler o diretório de mídia '${directoryPath}': ${error.message}`);
        return null;
    }
}

async function runFullProcess(theme, runParams, webContents) {
    if (theme === 'freeform' && !runParams.config.freeformPrompt.trim()) {
        logToRenderer(webContents, "AVISO: Tema 'Prompt Livre' pulado pois o texto está vazio.");
        return;
    }
    let videoFinalPath, outputPath, thumbnailPath = null;
    let storyData = null;

    try {
        let themeNames = {'futebol':'Notícias de Futebol','pescados':'Notícias de Pescados','ciencia':'Curiosidades Científicas','historinhas':'Historinhas Infantis','freeform':'Prompt Livre'}
        logToRenderer(webContents, "======================================");
        logToRenderer(webContents, `[${new Date().toLocaleString()}] Iniciando ciclo para o tema: ${themeNames[theme].toUpperCase()}`);
        const { duration, config } = runParams;

        let scriptRequestPrompt = '';
        const wordsPerMinute = 150; const targetWordCount = duration * wordsPerMinute; const minWords = Math.round(targetWordCount * 0.9); const maxWords = Math.round(targetWordCount * 1.1);
        const jsonRule = `Responda APENAS com um objeto JSON válido com as chaves "titulo", "descricao" e OBRIGATORIAMENTE "roteiro" (entre ${minWords} e ${maxWords} palavras). REGRA CRÍTICA: Todas as aspas duplas (") dentro dos valores de texto devem ser escapadas com uma barra invertida (\\"). Sua resposta DEVE ser um JSON válido e conter as três chaves. O roteiro deve ser um texto narrativo limpo, sem marcações de tempo ou indicações de cena.`;
        const callToActionCiencia = `O roteiro deve começar com "Se você adora ciência, não esqueça de curtir e se inscrever!" e terminar com "Para mais curiosidades incríveis como esta, não se esqueça de se inscrever e ativar as notificações!".`;
        const callToActionGenerico = `O roteiro deve começar com uma saudação e um convite para o espectador curtir o vídeo e se inscrever no canal, e terminar com um reforço do convite para se inscrever e ativar as notificações.`;
        const avoidanceInstruction = `Os seguintes temas e palavras-chave já foram abordados e devem ser EVITADOS: "${Array.from(youtubeKeywords).slice(0, 150).join(', ')}".`;

        if (['ciencia', 'historinhas', 'freeform'].includes(theme)) {
            let uniqueTopic = null;
            let brainstormTries = 3;
            let callToAction = callToActionGenerico;
            
            while(brainstormTries-- > 0 && !uniqueTopic) {
                logToRenderer(webContents, `   - Fase 1: Brainstorm de tópicos de '${themeNames[theme]}' com a IA...`);
                let topicPrompt = '';

                switch (theme) {
                    case 'ciencia':
                        topicPrompt = `Aja como um produtor de conteúdo científico especialista em encontrar nichos inexplorados. O canal já cobriu os tópicos populares. Gere uma lista de 10 títulos de vídeos sobre fatos surpreendentes ou descobertas recentes, focando em interseções de campos (ex: 'A Bioquímica do Medo') ou em tópicos de nicho (ex: 'O Paradoxo do Gato de Botas na Física Quântica'). Os títulos devem ser intrigantes e originais. ${avoidanceInstruction} Responda APENAS com a lista, um título por linha.`;
                        callToAction = callToActionCiencia;
                        break;
                    case 'historinhas':
                        topicPrompt = `Aja como um autor criativo de livros infantis. O objetivo é criar histórias que fujam do comum. Gere uma lista de 10 títulos originais para novas historinhas. Pense em personagens inusitados (ex: 'O Caracol que Colecionava Ecos') e conflitos criativos (ex: 'A Menina que Precisava Desvendar o Mistério do Riso Perdido'). ${avoidanceInstruction} Responda APENAS com a lista, um título por linha.`;
                        break;
                    case 'freeform':
                        topicPrompt = `Aja como um roteirista criativo. O tema central é "${config.freeformPrompt}". Gere uma lista de 10 títulos de vídeo que abordem este tema de ângulos completamente diferentes, inesperados e de nicho. Evite as abordagens mais óbvias. ${avoidanceInstruction} Responda APENAS com a lista, um título por linha.`;
                        break;
                }
                
                const topicListText = await callGeminiPlainText(config, topicPrompt, webContents);
                const topics = topicListText.split('\n').map(t => t.replace(/^[0-9-.\s]*/, '').trim()).filter(Boolean);

                for (const topic of topics) {
                    const topicKeywords = topic.toLowerCase().match(/\b(\w{5,})\b/g) || [];
                    const isDuplicate = topicKeywords.some(kw => youtubeKeywords.has(kw));
                    if (!isDuplicate) {
                        uniqueTopic = topic;
                        logToRenderer(webContents, `   - Tópico original selecionado: "${uniqueTopic}"`);
                        break;
                    }
                }
                if (!uniqueTopic && brainstormTries > 0) logToRenderer(webContents, `   - AVISO: Nenhum tópico 100% original na lista gerada. Tentando novamente...`);
            }
            if (!uniqueTopic) throw new Error(`Não foi possível gerar um tópico único para o tema '${themeNames[theme]}' após várias tentativas.`);
            
            scriptRequestPrompt = `Crie um roteiro completo para um vídeo com o título exato: "${uniqueTopic}". O roteiro deve ser cativante e informativo. ${callToAction} ${jsonRule}`;

        } else { // Lógica para temas de notícias
            const usedTopics = Array.from(sessionHistory).join(', ');
            const avoidanceInstructionNews = usedTopics ? `Estes títulos sobre o tema já foram usados: "${usedTopics}". Crie um roteiro com um TÍTULO E ÂNGULO COMPLETAMENTE NOVOS.` : '';
            switch(theme) {
                case 'futebol':
                    const newsContextFutebol = await searchGoogleForNews(config, webContents, 'últimas+notícias+futebol+brasileiro', config.searchEngineId);
                    const callToActionFutebol = `O roteiro deve começar com "Se você é um apaixonado por futebol, já deixa o like..." e terminar com "...Para não perder nenhuma novidade, não se esqueça de curtir e se inscrever!".`;
                    if (newsContextFutebol) { scriptRequestPrompt = `Aja como um redator de notícias esportivas. Com base nas seguintes notícias brutas de FUTEBOL BRASILEIRO: "${newsContextFutebol}". ${avoidanceInstructionNews} Crie um roteiro de notícias fluído e coeso.\nINSTRUÇÕES PARA O TÍTULO: 1. Analise todas as notícias e identifique o fato mais importante ou a notícia principal. 2. Crie um título que seja DIRETAMENTE baseado neste fato principal. Evite títulos genéricos.\nINSTRUÇÕES PARA O ROTEIRO: 1. NÃO RESUMA OU GENERALIZE. Reescreva os fatos de forma direta e jornalística, mantendo nomes de jogadores, times, placares e outros detalhes específicos. 2. OMITA FONTES: Não mencione as fontes das notícias. 3. SEJA FACTUAL: Evite adicionar opiniões ou conteúdo genérico.\n${callToActionFutebol} ${jsonRule}`; } else { scriptRequestPrompt = `Crie um roteiro sobre um tema GERAL e ATUAL do futebol brasileiro. ${avoidanceInstructionNews} ${callToActionFutebol} ${jsonRule}`; }
                    break;
                case 'pescados':
                    if (!config.searchEngineIdPiscare) throw new Error("O 'ID Pesquisa Pescados (Tema 2) (CX)' não foi configurado.");
                    const callToActionPiscare = `O roteiro deve terminar com "A Piscare Importadora traz para você as melhores notícias e os melhores pescados. Para saber mais, visite nosso site em piscareimportacao.com ou entre em contato pelo WhatsApp. Para mais informações e links, confira a descrição deste vídeo. Não se esqueça de curtir e se inscrever no canal para mais novidades do mundo dos pescados!".`;
                    const randomQuery = PESCADOS_SEARCH_QUERIES[Math.floor(Math.random() * PESCADOS_SEARCH_QUERIES.length)]; logToRenderer(webContents, `   - Usando termo de busca aleatório: "${randomQuery || 'Qualquer novidade'}"`); const newsContextPiscare = await searchGoogleForNews(config, webContents, randomQuery, config.searchEngineIdPiscare); if (newsContextPiscare) { scriptRequestPrompt = `Aja como um âncora de um telejornal de agronegócios. Com base exclusivamente nas seguintes notícias sobre o mercado de PESCADOS: "${newsContextPiscare}". ${avoidanceInstructionNews}\nINSTRUÇÕES PARA O TÍTULO: 1. Analise todas as notícias e identifique o fato mais importante ou a notícia principal. 2. Crie um título que seja DIRETAMENTE baseado neste fato principal. Evite títulos genéricos.\nINSTRUÇÕES PARA O ROTEIRO: 1. FOCO TOTAL: Use apenas informações sobre peixes, frutos do mar, aquicultura e pesca. IGNORE completamente notícias sobre outros setores. 2. NÃO RESUMA: Reescreva os fatos de forma direta e jornalística. 3. PROIBIDO CRIAR EXEMPLOS: Não crie descrições de empresas genéricas nem cite nomes de empresas que sejam fontes. Reporte apenas os fatos da notícia. 4. SEJA FACTUAL: Não adicione opiniões ou conteúdo "genérico".\n${callToActionPiscare} ${jsonRule}`; } else { scriptRequestPrompt = `Crie um roteiro sobre a importância do pescado na alimentação e na economia brasileira. ${avoidanceInstructionNews} ${callToActionPiscare} ${jsonRule}`; }
                    break;
            }
        }
        
        storyData = await callGeminiWithRetries(config, scriptRequestPrompt, webContents);
        if (!storyData || !storyData.roteiro) throw new Error("A IA não conseguiu gerar um roteiro válido.");

        const storyTitle = storyData.titulo;
        sessionHistory.add(storyTitle);
        logToRenderer(webContents, `   - Roteiro gerado com sucesso para: "${storyTitle}"`);
        storyData.roteiro = storyData.roteiro.replace(/(\r\n|\n|\r)/gm, " ").replace(/\s+/g, ' ').trim();
        const safeFilename = storyTitle.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 60);
        outputPath = path.join(config.outputDir, `${new Date().toISOString().slice(0, 10)}_${safeFilename}`);
        await fs.promises.mkdir(outputPath, { recursive: true });
        await fs.promises.writeFile(path.join(outputPath, `roteiro_${safeFilename}.txt`), storyData.roteiro);
        const audioPath = path.join(outputPath, `audio_${safeFilename}.mp3`);
        await generateAudioNodeJS(storyData.roteiro, audioPath, webContents, theme, config);
        const narrationDuration = await getMediaDuration(audioPath);
        
        // --- 2. ESCOLHA DA MÍDIA DE FUNDO E GERAÇÃO DA THUMBNAIL ---
        let chosenBackground = null;
        let baseImagePathForThumbnail = null;
        let aiGeneratedImagePaths = [];
        const prefixMap = { futebol: 'futebol', ciencia: 'ciencia', freeform: 'generico', historinhas: 'historinha', pescados: 'pescado' };
        
        if (config.prioritizeAiBackground || config.useAiAsFallback || config.randomizeBackground) {
            const imageCount = config.aiImageCount > 1 ? config.aiImageCount : 1;
            const imagePrompts = await generateImagePromptsFromScript(storyData.roteiro, imageCount, config, webContents);
            if (imagePrompts.length > 0) {
                const generatedImages = [];
                for (let i = 0; i < imagePrompts.length; i++) {
                    const seed = Math.floor(Math.random() * 1000000);
                    const imagePath = await generateAiImage(imagePrompts[i], config, outputPath, webContents, seed);
                    if (imagePath) generatedImages.push(imagePath);
                }
                if (generatedImages.length > 0) aiGeneratedImagePaths = [...generatedImages];
            }
        }

        if (aiGeneratedImagePaths.length > 0) {
            logToRenderer(webContents, '   - Usando imagem de IA como fundo.');
            chosenBackground = aiGeneratedImagePaths[0];
            baseImagePathForThumbnail = aiGeneratedImagePaths[Math.floor(Math.random() * aiGeneratedImagePaths.length)];
        } else {
            logToRenderer(webContents, '   - Nenhuma imagem de IA gerada. Usando mídia local.');
            chosenBackground = await selectMediaByTheme(theme, config.backgroundsPath, prefixMap, webContents, true);
            if (chosenBackground) {
                if (/\.(mp4|mov|avi)$/i.test(chosenBackground)) {
                    logToRenderer(webContents, '   - Extraindo frame do VÍDEO DE FUNDO ORIGINAL para a thumbnail.');
                    baseImagePathForThumbnail = await extractFrameFromVideo(chosenBackground, outputPath, webContents);
                } else {
                    logToRenderer(webContents, '   - Usando IMAGEM DE FUNDO como base para a thumbnail.');
                    baseImagePathForThumbnail = chosenBackground;
                }
            }
        }
        
        if (runParams.upload && baseImagePathForThumbnail) {
            const thumbOutputPath = path.join(outputPath, 'thumbnail_final.jpg');
            if (runParams.config.includeTitleOnThumbnail) {
                const thumbnailColor = getNextThumbnailColor();
                logToRenderer(webContents, `   - Adicionando título à thumbnail com a cor ${thumbnailColor}.`);
                thumbnailPath = await generateThumbnail(baseImagePathForThumbnail, storyTitle, thumbOutputPath, webContents, thumbnailColor);
            } else {
                logToRenderer(webContents, '   - Usando imagem base como thumbnail (sem texto sobreposto).');
                try {
                    await sharp(baseImagePathForThumbnail).resize(1280, 720).toFile(thumbOutputPath);
                    thumbnailPath = thumbOutputPath;
                } catch (e) { logToRenderer(webContents, `   - ❌ ERRO ao preparar imagem base para thumbnail: ${e.message}`); }
            }
        } else if (runParams.upload) {
            logToRenderer(webContents, `   - AVISO: Não foi possível obter uma imagem base para a thumbnail.`);
        }
        
        // --- 3. MONTAGEM DO VÍDEO INTERMEDIÁRIO ---
        if (aiGeneratedImagePaths.length > 1) {
            logToRenderer(webContents, `   - Criando slideshow com ${aiGeneratedImagePaths.length} imagens...`);
            const slideshowPath = path.join(outputPath, 'ai_slideshow.mp4');
            const imageDuration = narrationDuration / aiGeneratedImagePaths.length;
            let concatInput = "", filterComplex = "";
            aiGeneratedImagePaths.forEach((img, i) => { concatInput += `-loop 1 -t ${imageDuration} -i "${img}" `; const kenBurnsEffect = getKenBurnsEffect(imageDuration); filterComplex += `[${i}:v]setsar=1,${kenBurnsEffect},fade=t=in:st=0:d=1,fade=t=out:st=${imageDuration - 1}:d=1[v${i}];`; });
            const streamSpecifiers = aiGeneratedImagePaths.map((_, i) => `[v${i}]`).join('');
            filterComplex += `${streamSpecifiers}concat=n=${aiGeneratedImagePaths.length}:v=1:a=0[v]`;
            await runCommand(`"${FFMPEG_PATH}" ${concatInput} -filter_complex "${filterComplex}" -map "[v]" -c:v libx264 -pix_fmt yuv420p -r 30 -y "${slideshowPath}"`);
            chosenBackground = slideshowPath;
        }

        const fadeDuration = 3;
        const totalDuration = narrationDuration + fadeDuration;
        
        if (!chosenBackground) {
            logToRenderer(webContents, '   - Nenhum fundo encontrado ou gerado. Usando fundo preto.');
            chosenBackground = path.join(outputPath, 'black_bg.mp4');
            await runCommand(`"${FFMPEG_PATH}" -f lavfi -i color=c=black:s=1920x1080:r=30 -t ${totalDuration} -pix_fmt yuv420p "${chosenBackground}"`);
        }

        let chosenMusic; if (config.musicasPath && fs.existsSync(config.musicasPath)) { const validMusic = (await fs.promises.readdir(config.musicasPath)).filter(f => /\.(mp3|wav|aac|m4a|flac)$/i.test(f)); if (validMusic.length > 0) chosenMusic = path.join(config.musicasPath, validMusic[Math.floor(Math.random() * validMusic.length)]); }

        const corpoPrincipalPath = path.join(outputPath, `corpo_principal_${safeFilename}.mp4`);
        const loopInput = chosenBackground.toLowerCase().endsWith('.mp4') ? '-stream_loop -1' : '';
        const isStillImage = /\.(jpg|jpeg|png)$/i.test(chosenBackground);
        const kenBurnsFilter = isStillImage ? `,${getKenBurnsEffect(totalDuration)}` : "";
        const filterVideo = `[0:v]setsar=1${kenBurnsFilter}[v_story];`;
        let inputs = `${loopInput} -i "${chosenBackground}" -i "${audioPath}"`;
        let filterComplex, map;
        if (chosenMusic) { inputs += ` -i "${chosenMusic}"`; filterComplex = `"${filterVideo}[1:a]volume=1.5[a_story];[2:a]volume=0.25,aloop=loop=-1:size=2e+09,afade=t=out:st=${narrationDuration}:d=${fadeDuration}[a_bg];[a_story][a_bg]amix=inputs=2:duration=longest[a_mix]"`; map = `-map "[v_story]" -map "[a_mix]"`; } else { filterComplex = `"${filterVideo}[1:a]volume=1.5[a_mix]"`; map = `-map "[v_story]" -map "[a_mix]"`; }
        await runCommand(`"${FFMPEG_PATH}" ${inputs} -filter_complex ${filterComplex} ${map} -t ${totalDuration} -c:v libx264 -c:a aac -b:a 192k -r 30 -y "${corpoPrincipalPath}"`);

        // --- 4. MONTAGEM DO VÍDEO FINAL ---
        videoFinalPath = path.join(outputPath, `video_${safeFilename}.mp4`);
        const chosenIntro = await selectMediaByTheme(theme, config.introPath, prefixMap, webContents, false);
        if (chosenIntro) {
            logToRenderer(webContents, '   - Adicionando introdução ao vídeo...');
            const concatFilter = `[0:v]scale=1920:1080,setsar=1[v0];[1:v]scale=1920:1080,setsar=1[v1];[0:a]anull[a0];[1:a]anull[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]`;
            await runCommand(`"${FFMPEG_PATH}" -i "${chosenIntro}" -i "${corpoPrincipalPath}" -filter_complex "${concatFilter}" -map "[outv]" -map "[outa]" -c:v libx264 -c:a aac -b:a 192k -r 30 "${videoFinalPath}"`);
        } else {
            logToRenderer(webContents, '   - Nenhuma introdução encontrada. Renomeando corpo principal para vídeo final.');
            await fs.promises.rename(corpoPrincipalPath, videoFinalPath);
        }

        logToRenderer(webContents, "✨ VÍDEO FINALIZADO COM SUCESSO! ✨");
        webContents.send('video-complete');
    } catch (error) {
        throw error;
    }

    // --- 5. UPLOAD E LIMPEZA ---
    if (runParams.upload && videoFinalPath && storyData) {
        const uploadSuccess = await uploadToYouTube(videoFinalPath, storyData.titulo, storyData.descricao, runParams.config, webContents, [], thumbnailPath);
        
        if (uploadSuccess) {
            const finalKeywords = (storyData.titulo.toLowerCase().match(/\b(\w{5,})\b/g) || []);
            finalKeywords.forEach(kw => youtubeKeywords.add(kw));
        }

        if (runParams.delete && uploadSuccess) {
            logToRenderer(webContents, `   - Tentando mover pasta do projeto para a lixeira...`);
            if (global.gc) {
                global.gc();
                logToRenderer(webContents, '   - Coletor de lixo invocado para liberar recursos.');
            }
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            try {
                await shell.trashItem(outputPath);
                logToRenderer(webContents, `   - ✅ Pasta do projeto movida para a lixeira com sucesso: ${outputPath}`);
            } catch (trashError) {
                logToRenderer(webContents, `   - ❌ ERRO: Não foi possível mover a pasta para a lixeira. Erro: ${trashError.message}.`);
                logToRenderer(webContents, `   - Este erro pode ocorrer se algum programa (como o próprio app) ainda estiver acessando um arquivo na pasta.`);
            }
        }
    }
}

async function handleApiError(response, model, webContents) { if (response.status === 429) { logToRenderer(webContents, `   - AVISO: Limite de cota (Rate Limit) atingido para o modelo ${model}.`); return; } logToRenderer(webContents, `   - Erro na chamada com ${model}. Status: ${response.status}`); }

// <<< CORREÇÃO DE PARSE DE JSON >>>
function cleanAndParseJson(rawText) {
    // 1. Encontra o bloco JSON
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error("Nenhum bloco JSON encontrado na resposta da API.");
    }
    let jsonString = jsonMatch[0];

    // 2. Remove quebras de linha dentro das strings
    jsonString = jsonString.replace(/:\s*"(.*?)"/gs, (match, group1) => {
        const cleanedGroup = group1.replace(/\r\n|\n|\r/g, ' ').replace(/"/g, '\\"');
        return `: "${cleanedGroup}"`;
    });
    
    // 3. Tenta fazer o parse
    return JSON.parse(jsonString);
}


async function callGeminiWithRetries(config, promptString, webContents, isSilent = false) {
    const flashModel = 'gemini-1.5-flash-latest';
    const proModel = 'gemini-1.5-pro-latest';
    const flashRetries = 3;

    for (let i = 0; i < flashRetries; i++) {
        if (!isSilent) logToRenderer(webContents, `   - Tentativa ${i + 1}/${flashRetries} com o modelo ${flashModel}...`);
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${flashModel}:generateContent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiApiKey },
                body: JSON.stringify({ contents: [{ parts: [{ text: promptString }] }] })
            });
            if (response.ok) {
                const data = await response.json();
                const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                return cleanAndParseJson(rawText); // Usa a função de limpeza
            } else {
                await handleApiError(response, flashModel, webContents);
                throw new Error(`API retornou status ${response.status}`);
            }
        } catch (error) {
            if (!isSilent) logToRenderer(webContents, `   - AVISO: Tentativa ${i + 1} com Flash falhou: ${error.message}`);
            if (i < flashRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    if (!isSilent) logToRenderer(webContents, `   - Todas as tentativas com Flash falharam. Tentando fallback com ${proModel}...`);
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${proModel}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiApiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptString }] }] })
        });
        if (response.ok) {
            const data = await response.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            return cleanAndParseJson(rawText); // Usa a função de limpeza
        } else {
             await handleApiError(response, proModel, webContents);
        }
    } catch (error) {
         if (!isSilent) logToRenderer(webContents, `   - AVISO: Tentativa de fallback com Pro também falhou: ${error.message}`);
    }

    throw new Error("Todas as tentativas de chamada à API Gemini (incluindo fallback) falharam.");
}

async function callGeminiPlainText(config, promptString, webContents) {
    const model = 'gemini-1.5-flash-latest';
    for (let i = 0; i < 2; i++) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiApiKey }, body: JSON.stringify({ contents: [{ parts: [{ text: promptString }] }] }) });
            if (response.ok) {
                const data = await response.json();
                const text = data?.candidates?.[0]?.content?.parts?.[0]?.text.trim();
                if (text) return text;
            } else {
                await handleApiError(response, model, webContents);
                if (i < 1) await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (error) {
            logToRenderer(webContents, `   - Erro de rede com ${model}: ${error.message}`);
            if (i < 1) await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    throw new Error("Falha ao chamar a API Gemini para texto puro após 2 tentativas.");
}

const getMediaDuration = (filePath) => runCommand(`"${FFPROBE_PATH}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`).then(parseFloat);

async function generateAudioNodeJS(text, outputFile, webContents, theme, config) {
    if (!config.googleSearchApiKey) {
        const errorMsg = '   - ❌ ERRO: A "Google Cloud API Key" não foi configurada na aba de APIs. Impossível gerar áudio.';
        logToRenderer(webContents, errorMsg);
        throw new Error(errorMsg);
    }
    const maleVoices = [{"languageCode":"pt-BR","name":"pt-BR-Wavenet-B"}, {"languageCode":"pt-BR","name":"pt-BR-Wavenet-D"}];
    const narratorVoices = [{"languageCode":"pt-BR","name":"pt-BR-Wavenet-D"}];
    const generalVoices = [{"languageCode":"pt-BR","name":"pt-BR-Wavenet-A"}, {"languageCode":"pt-BR","name":"pt-BR-Wavenet-C"}, {"languageCode":"pt-BR","name":"pt-BR-Wavenet-E"}, {"languageCode":"pt-BR","name":"pt-BR-Wavenet-B"}, {"languageCode":"pt-BR","name":"pt-BR-Wavenet-D"}];
    let selectedVoices = generalVoices;
    const themeNames = { 'pescados': 'Notícias de Pescados', 'futebol': 'Notícias de Futebol' };

    if (theme === 'futebol' || theme === 'pescados') {
        logToRenderer(webContents, `   - Tema '${themeNames[theme]}' detectado. Selecionando voz masculina/narrador.`);
        selectedVoices = maleVoices;
    } else if (theme === 'freeform' || theme === 'ciencia') {
        logToRenderer(webContents, `   - Analisando tom do roteiro...`);
        try {
            const tonePrompt = `Analise o tom do seguinte roteiro: "${text.substring(0, 500)}...". O tema é sombrio, misterioso ou inusitado? Responda APENAS com "sombrio" ou "geral".`;
            const tone = await callGeminiPlainText(config, tonePrompt, webContents);
            if (tone.toLowerCase().includes('sombrio')) {
                logToRenderer(webContents, `   - Tom 'sombrio/inusitado' detectado. Selecionando voz de narrador.`);
                selectedVoices = narratorVoices;
            } else {
                 logToRenderer(webContents, `   - Tom 'geral' detectado.`);
            }
        } catch (error) {
            logToRenderer(webContents, `   - AVISO: Falha ao analisar o tom do roteiro. Usando voz geral. Erro: ${error.message}`);
        }
    }
    
    const vozSorteada = selectedVoices[Math.floor(Math.random() * selectedVoices.length)];
    const requestBody = {input:{text:text},voice:{languageCode:vozSorteada.languageCode,name:vozSorteada.name},audioConfig:{audioEncoding:'MP3',speakingRate:0.95}};

    try {
        const apiResponse = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${config.googleSearchApiKey}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)});
        if (!apiResponse.ok) {
            const errorData = await apiResponse.json();
            throw new Error(`API Text-to-Speech retornou erro ${apiResponse.status}: ${errorData?.error?.message || 'Erro desconhecido'}`);
        }
        const data = await apiResponse.json();
        const audioBuffer = Buffer.from(data.audioContent, 'base64');
        await fs.promises.writeFile(outputFile, audioBuffer);
        logToRenderer(webContents, `   - Áudio gerado com a voz ${vozSorteada.name}.`);
    } catch (error) {
        logToRenderer(webContents, `   - ❌ ERRO FATAL ao gerar áudio: ${error.message}`);
        throw error;
    }
}

async function searchGoogleForNews(config, webContents, query, cxId) {
    if (!config.googleSearchApiKey || !cxId) {
        logToRenderer(webContents, `   - AVISO: Chave da API Google ou CX ID não fornecidos para esta busca. Pulando.`);
        return null;
    }
    const url = `https://www.googleapis.com/customsearch/v1?key=${config.googleSearchApiKey}&cx=${cxId}&q=${query}&sort=date&num=10`; 
    try { 
        const response = await fetch(url); 
        if (!response.ok) throw new Error(`Status da busca: ${response.status}`); 
        const data = await response.json(); 
        if (!data.items || data.items.length === 0) return null; 
        return data.items.map(item => `Título: ${item.title}\nTrecho: ${item.snippet}`).join('\n\n'); 
    } catch (error) { 
        logToRenderer(webContents, `   - ❌ ERRO na busca na web: ${error.message}`); 
        return null; 
    } 
}

async function uploadToYouTube(videoPath, title, description, config, webContents, recentVideos = [], thumbnailPath = null) {
    if (!config.youtubeClientId || !config.youtubeClientSecret || !config.youtubeRefreshToken) {
        logToRenderer(webContents, '   - AVISO: Credenciais do YouTube não fornecidas. Upload pulado.');
        return false;
    }
    
    let descricaoFinal = description;
    const textoPadraoOpcional = config.youtubeDefaultDescription;
    if (textoPadraoOpcional && textoPadraoOpcional.trim() !== '') {
        descricaoFinal += `\n\n${textoPadraoOpcional.trim()}`;
    }

    try {
        const oauth2Client = new google.auth.OAuth2(config.youtubeClientId, config.youtubeClientSecret, REDIRECT_URI);
        oauth2Client.setCredentials({ refresh_token: config.youtubeRefreshToken });
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

        logToRenderer(webContents, '   - Lendo arquivo de vídeo para a memória para evitar bloqueio...');
        const videoBuffer = await fs.promises.readFile(videoPath);

        const videoStream = new Readable();
        videoStream.push(videoBuffer);
        videoStream.push(null);

        const response = await youtube.videos.insert({
            part: 'id,snippet,status',
            requestBody: {
                snippet: { title, description: descricaoFinal, tags: ['futebol', 'noticias', 'historia', 'ciencia', 'curiosidades', 'pescados'], categoryId: '24' },
                status: { privacyStatus: 'public' },
            },
            media: { 
                body: videoStream 
            },
        });
        const videoId = response.data.id;
        logToRenderer(webContents, `   - ✅ VÍDEO ENVIADO! Link: https://www.youtube.com/watch?v=${videoId}`);

        if (thumbnailPath) {
            logToRenderer(webContents, '   - Lendo thumbnail para a memória...');
            try {
                const thumbnailBuffer = await fs.promises.readFile(thumbnailPath);
                const thumbStream = new Readable();
                thumbStream.push(thumbnailBuffer);
                thumbStream.push(null);
                
                await youtube.thumbnails.set({
                    videoId: videoId,
                    media: { mimeType: 'image/jpeg', body: thumbStream },
                });
                logToRenderer(webContents, '   - ✅ Thumbnail personalizada enviada com sucesso!');
            } catch (thumbError) {
                logToRenderer(webContents, `   - ⚠️ AVISO: O vídeo foi enviado, mas falhou ao enviar a thumbnail. Erro: ${thumbError.message}`);
            }
        }
        return true;
    } catch (err) {
        logToRenderer(webContents, `   - ❌ ERRO NO UPLOAD: ${err.message}`);
        return false;
    }
}

async function checkYouTubeForDuplicates(config, webContents) {
    if (!config.youtubeClientId || !config.youtubeClientSecret || !config.youtubeRefreshToken) {
        logToRenderer(webContents, '   - AVISO: Credenciais do YouTube não disponíveis. Pulando verificação de duplicidade.');
        return;
    }
    try {
        const oauth2Client = new google.auth.OAuth2(config.youtubeClientId, config.youtubeClientSecret, REDIRECT_URI);
        oauth2Client.setCredentials({ refresh_token: config.youtubeRefreshToken });
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
        const channelResponse = await youtube.channels.list({ part: 'contentDetails', mine: true });
        if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
            logToRenderer(webContents, '   - AVISO: Não foi possível encontrar o canal do YouTube.');
            return;
        }
        const uploadsPlaylistId = channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;
        
        let allItems = [];
        let nextPageToken = null;
        let pagesToFetch = 2; 

        youtubeKeywords.clear();

        for (let i = 0; i < pagesToFetch; i++) {
            const playlistParams = {
                part: 'snippet',
                playlistId: uploadsPlaylistId,
                maxResults: 50,
            };
            if (nextPageToken) {
                playlistParams.pageToken = nextPageToken;
            }
            const playlistResponse = await youtube.playlistItems.list(playlistParams);
            if(playlistResponse.data.items) allItems = allItems.concat(playlistResponse.data.items);
            nextPageToken = playlistResponse.data.nextPageToken;
            if (!nextPageToken) break; 
        }
        
        for (const item of allItems) {
            const desc = item.snippet.description || '';
            const title = item.snippet.title || '';
            const content = `${title} ${desc}`.toLowerCase();
            const keywords = content.match(/\b(\w{5,})\b/g) || [];
            keywords.forEach(kw => youtubeKeywords.add(kw));
        }
        logToRenderer(webContents, `   - Verificados ${allItems.length} vídeos recentes. Banco de dados com ${youtubeKeywords.size} palavras-chave únicas.`);
    } catch (err) {
        logToRenderer(webContents, `   - AVISO: Falha ao verificar vídeos no YouTube: ${err.message}`);
    }
}

function getNextRunDate(job) {
    if (!job) return 'indeterminada';
    try {
        if (typeof job.nextDates === 'function') {
            const dates = job.nextDates(1);
            if (dates.length > 0) return dates[0].toLocaleString();
        }
    } catch(e) { console.error("Could not determine next cron run:", e); }
    return 'indeterminada';
}

function startAutomationTask(webContents, runData) {
    if (cronJob) cronJob.stop();
    if (!cron.validate(runData.schedule)) {
        webContents.send('invalid-schedule', runData.schedule);
        return;
    }
    currentThemesList = [...runData.config.selectedThemes];
    currentRunParams = runData;
    cronJob = cron.schedule(runData.schedule, () => runFullSequence(webContents), { timezone: "America/Sao_Paulo" });
    logToRenderer(webContents, `Automação agendada. Próxima execução: ${getNextRunDate(cronJob)}`);
    if (runData.runImmediately) runFullSequence(webContents);
    webContents.send('automation-started');
}

function stopAutomation(event, force) {
    if (force) {
        if (activeFfmpegProcess) {
            activeFfmpegProcess.kill('SIGKILL');
            logToRenderer(event.sender, "Processo FFmpeg interrompido forçadamente.");
        }
        if (cronJob) cronJob.stop();
        cronJob = null;
        stopAfterCurrentTask = false;
        isProcessing = false;
        logToRenderer(event.sender, "Automação parada.");
    } else {
        if(cronJob) cronJob.stop();
        cronJob = null;
        stopAfterCurrentTask = true;
        logToRenderer(event.sender, "Interrupção agendada. A automação parará após o vídeo atual.");
        if (!isProcessing) stopAutomation(event, true);
    }
}

async function performFirstRunSetup() {
    if (!app.isPackaged) {
        const mediaDirs = ['musicas', 'introducoes', 'fundos'];
        for (const dir of mediaDirs) {
            try { await fs.promises.mkdir(path.join(userDataPath, dir), { recursive: true }); } 
            catch (error) { console.error(`Falha ao garantir a existência do diretório padrão ${dir} em dev:`, error); }
        }
        return;
    }
    const firstRunFlag = path.join(userDataPath, '.firstrun');
    if (fs.existsSync(firstRunFlag)) return;
    console.log("Primeira execução detectada. Realizando setup inicial...");
    const sourceResourcesPath = process.resourcesPath;
    try {
        const sourceConfig = path.join(sourceResourcesPath, 'config.json');
        if (fs.existsSync(sourceConfig) && !fs.existsSync(configPath)) {
            await fs.promises.copyFile(sourceConfig, configPath);
            console.log("config.json padrão copiado com sucesso.");
        }
    } catch(err) { console.error("Erro ao copiar config.json padrão:", err); }
    const mediaDirs = ['musicas', 'introducoes', 'fundos'];
    const sourceMediaBasePath = path.join(sourceResourcesPath, 'default-media');
    if (fs.existsSync(sourceMediaBasePath)) {
        for (const dir of mediaDirs) {
            const destDir = path.join(userDataPath, dir);
            if (!fs.existsSync(destDir)) {
                try {
                    await fs.promises.cp(path.join(sourceMediaBasePath, dir), destDir, { recursive: true });
                    console.log(`Pasta padrão '${dir}' copiada com sucesso.`);
                } catch (err) {
                    console.error(`Falha ao copiar pasta de mídia padrão '${dir}':`, err);
                }
            }
        }
    }
    try { await fs.promises.writeFile(firstRunFlag, new Date().toISOString()); } 
    catch(err) { console.error("Não foi possível criar o arquivo de flag .firstrun:", err); }
}

function createWindow() { 
    app.commandLine.appendSwitch('js-flags', '--expose-gc');

    const openAsHidden = process.argv.includes('--open-as-hidden');
    mainWindow = new BrowserWindow({ width:1200, height:950, show:!1, icon:path.join(__dirname,'build-assets/icon.png'), webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:!0}}); 
    if (!openAsHidden) {
        mainWindow.maximize();
        mainWindow.show();
    }
    mainWindow.on('close', (e) => { 
        if (isConfigDirty && !forceQuit) { 
            e.preventDefault();
            const choice = dialog.showMessageBoxSync(mainWindow, { type:'question', buttons:['Salvar e Sair','Sair sem Salvar','Cancelar'], title:'Sair', message:'Você tem alterações não salvas. Deseja salvá-las?'}); 
            if (choice === 0) {
                ipcMain.once('save-default-config', (event, config) => { 
                    fs.writeFileSync(configPath, JSON.stringify(config, null, 2)); 
                    forceQuit = true; 
                    app.quit();
                }); 
                mainWindow.webContents.send('get-config'); 
            } else if (choice === 1) {
                forceQuit = true; 
                app.quit();
            }
        }
    }); 
    mainWindow.loadFile('index.html'); 
}

app.whenReady().then(async () => { await performFirstRunSetup(); createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('will-quit', () => {
  console.log('Evento will-quit acionado. Realizando limpeza final...');
  if (cronJob) cronJob.stop();
  if (activeFfmpegProcess) activeFfmpegProcess.kill('SIGKILL');
  if (authServer) authServer.close();
});

ipcMain.on('set-dirty-state', (event, isDirty) => { isConfigDirty = isDirty; });
ipcMain.handle('select-folder', async () => (await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })).filePaths[0]);
ipcMain.handle('get-user-data-path', () => app.getPath('userData'));

ipcMain.on('set-startup-behavior', (event, isEnabled) => {
    if (app.isPackaged) {
        app.setLoginItemSettings({ openAtLogin: isEnabled, path: app.getPath('exe'), args: isEnabled ? ['--open-as-hidden'] : [] });
    } else {
        logToRenderer(event.sender, "AVISO: A opção 'Iniciar com o Windows' só funciona no aplicativo instalado.");
    }
});

ipcMain.on('start-automation', (event, runData) => startAutomationTask(event.sender, runData));

ipcMain.handle('open-config-file', async () => { 
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties:['openFile'], filters:[{name:'JSON Files',extensions:['json']}]}); 
    if (canceled || !filePaths.length) return null; 
    try { 
        return { filePath: filePaths[0], config: JSON.parse(await fs.promises.readFile(filePaths[0], 'utf8')) }; 
    } catch (error) { 
        logToRenderer(mainWindow.webContents, `ERRO ao ler o arquivo de configuração: ${error.message}`); 
        return null; 
    }
});

ipcMain.on('save-default-config', async (event, config) => {
    try { await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2)); } 
    catch (error) { logToRenderer(event.sender, `ERRO ao salvar a configuração padrão: ${error.message}`); }
});

ipcMain.handle('save-config-file-as', async (event, config) => { 
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, { title:'Salvar Configuração Como...', defaultPath:'minha-config.json', filters:[{name:'JSON Files',extensions:['json']}]}); 
    if (canceled || !filePath) return null; 
    try { 
        await fs.promises.writeFile(filePath, JSON.stringify(config, null, 2)); 
        return { filePath }; 
    } catch (error) { 
        logToRenderer(event.sender, `ERRO ao salvar o arquivo: ${error.message}`); 
        return null; 
    }
});

ipcMain.handle('load-default-config', async () => { 
    try { 
        if (fs.existsSync(configPath)) return JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
    } catch (error) { 
        dialog.showErrorBox('Erro de Configuração', `O arquivo de configuração (config.json) parece estar corrompido.\n\nPor favor, delete o arquivo em '${configPath}' e reinicie o aplicativo.\n\nDetalhe do erro: ${error.message}`); 
    } 
    return null; 
});

ipcMain.on('show-start-menu', (event, runData) => { 
    const menu = Menu.buildFromTemplate([{label:'Gerar Sequência Completa e Agendar',click:()=>startAutomationTask(event.sender,{...runData,runImmediately:!0})},{label:'Apenas Agendar',click:()=>startAutomationTask(event.sender,{...runData,runImmediately:!1})}]); 
    menu.popup({ window: BrowserWindow.fromWebContents(event.sender) }); 
});

ipcMain.on('show-stop-menu', (event) => {
    const menu = Menu.buildFromTemplate([{label:'Interromper Após o Vídeo Atual',click:()=>stopAutomation(event,!1)},{label:'Interromper Agora (Forçado)',click:()=>stopAutomation(event,!0)}]);
    menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
});

ipcMain.on('youtube-logout', async (event) => {
    try {
        let config = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
        delete config.youtubeRefreshToken;
        delete config.youtubeChannelName;
        await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2));
        if (authServer) authServer.close(() => { authServer = null; logToRenderer(event.sender, 'Servidor de autenticação finalizado.'); });
        event.sender.send('config-updated', config);
        logToRenderer(event.sender, 'Logout do YouTube efetuado com sucesso.');
    } catch (err) {
        logToRenderer(event.sender, `ERRO ao deslogar: ${err.message}`);
    }
});

ipcMain.on('youtube-login', (event, credentials) => { 
    if (authServer) {
        logToRenderer(event.sender, 'AVISO: Um processo de login já está em andamento.');
        return;
    }
    const oauth2Client = new google.auth.OAuth2(credentials.clientId, credentials.clientSecret, REDIRECT_URI); 
    authServer = http.createServer(async (req, res) => { 
        try { 
            const code = new URL(req.url, REDIRECT_URI).searchParams.get('code'); 
            if (!code) return res.end(); 
            res.end('<h1>Autenticação concluída!</h1><p>Pode fechar esta aba.</p>'); 
            const { tokens } = await oauth2Client.getToken(code); 
            let config = {}; 
            try { config = JSON.parse(await fs.promises.readFile(configPath, 'utf8')); } catch {} 
            Object.assign(config, { youtubeRefreshToken: tokens.refresh_token, youtubeClientId: credentials.clientId, youtubeClientSecret: credentials.clientSecret }); 
            oauth2Client.setCredentials(tokens); 
            const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
            const channelResponse = await youtube.channels.list({ part: 'snippet', mine: true }); 
            if (channelResponse.data.items && channelResponse.data.items.length > 0) {
                config.youtubeChannelName = channelResponse.data.items[0].snippet.title; 
            }
            await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2)); 
            event.sender.send('config-updated', config); 
        } catch (e) { 
            logToRenderer(event.sender, `ERRO na autenticação: ${e.message}`); 
        } finally { 
            if (authServer) authServer.close();
        } 
    })
    .listen(3000, () => {
        shell.openExternal(oauth2Client.generateAuthUrl({ access_type:'offline', prompt:'consent', scope:['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'] }));
    })
    .on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            logToRenderer(event.sender, '❌ ERRO: A porta 3000 já está em uso. Se você acabou de fechar o app, aguarde um momento. Se o erro persistir, outro programa pode estar usando a porta.');
            if (authServer) authServer.close();
        } else {
            logToRenderer(event.sender, `ERRO no servidor de autenticação: ${err.message}`);
        }
        authServer = null;
    })
    .on('close', () => { 
        authServer = null; 
    }); 
});
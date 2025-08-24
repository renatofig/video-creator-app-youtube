const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const cron = require('node-cron');
const http = require('http');
const { google } = require('googleapis');
const { Readable } = require('stream');
const FormData = require('form-data');
const sharp = require('sharp');
const pdf = require('pdf-parse');
const speech = require('@google-cloud/speech').v1p1beta1;
const { Storage } = require('@google-cloud/storage');

const isDev = !app.isPackaged;

if (process.platform === 'win32') {
    app.setAppUserModelId("com.seu-nome.videocreator");
}

let mainWindow, cronJob, authServer;
let sessionHistory = new Set();
let youtubeKeywords = new Set();
let isConfigDirty = false;
let forceQuit = false;
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'config.json');

let currentThemesList = [];
let currentRunParams = {};
let stopAfterCurrentTask = false;
let activeProcess = null;
let isProcessing = false;

// --- INÍCIO DA LÓGICA DE AUTORIZAÇÃO ---
async function isUserAuthorized(config, webContents) {
    // URL da planilha de assinantes embutida diretamente no código.
    const hardcodedSheetUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTrRX6776zzjOI2KOn9twm6LisKQt4LKI1IvN-4TYm1-SktlZcOoFYwj2p6fIbpx_cdMgKUi2fIs3Oh/pub?output=csv";

    const userEmail = config.userEmail;
    // Se o email do usuário não foi inserido, ele não está autorizado.
    if (!userEmail || !userEmail.trim()) {
        logToRenderer(webContents, '❌ AUTORIZAÇÃO FALHOU: O campo "Email de Assinante" é obrigatório para iniciar.');
        dialog.showErrorBox('Acesso Negado', 'Por favor, insira seu e-mail de assinante na aba APIs para continuar.');
        return false;
    }

    logToRenderer(webContents, '   - Verificando autorização do usuário...');
    try {
        const response = await fetch(hardcodedSheetUrl);
        if (!response.ok) {
            throw new Error(`Não foi possível acessar a planilha de assinantes. Status: ${response.status}`);
        }
        
        const csvText = await response.text();
        const authorizedEmails = csvText
            .split('\n')
            .map(email => email.trim().toLowerCase())
            .filter(Boolean); // Remove linhas em branco

        const isAuthorized = authorizedEmails.includes(userEmail.toLowerCase());

        if (isAuthorized) {
            logToRenderer(webContents, '   - ✅ Usuário autorizado com sucesso.');
            return true;
        } else {
            logToRenderer(webContents, `   - ❌ AUTORIZAÇÃO FALHOU: O email "${userEmail}" não foi encontrado na lista de assinantes.`);
            dialog.showErrorBox('Acesso Negado', `O e-mail "${userEmail}" não está autorizado a usar este aplicativo. Por favor, contate o suporte.`);
            return false;
        }

    } catch (error) {
        logToRenderer(webContents, `   - ❌ ERRO DE AUTORIZAÇÃO: Não foi possível verificar a lista de assinantes. Detalhes: ${error.message}`);
        dialog.showErrorBox('Erro de Conexão', 'Não foi possível verificar sua licença. Por favor, verifique sua conexão com a internet e tente novamente.');
        return false; // Falha na verificação, bloqueia por segurança.
    }
}
// --- FIM DA LÓGICA DE AUTORIZAÇÃO ---


// --- Lógica de Cores para Thumbnail ---
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

// --- Estrutura de Dados para Internacionalização (i18n) ---
const langData = {
    pt: {
        themeNames: {'football':'Notícias de Futebol','fisheries':'Notícias de Pescados','science':'Curiosidades Científicas','stories':'Historinhas Infantis','freeform':'Prompt Livre', 'fixedtext': 'Texto Fixo (upload)'},
        jsonRule: (min, max) => `Responda APENAS com um objeto JSON válido com as chaves "titulo", "descricao" e OBRIGATORIAMENTE "roteiro" (entre ${min} e ${max} palavras). REGRA CRÍTICA: O roteiro deve ser um texto narrativo limpo, SEM NENHUMA MARCAÇÃO DE CENA OU TEMPO (como '(Introdução)' ou '(0:00-0:30)'). Todas as aspas duplas (") dentro dos valores de texto devem ser escapadas com uma barra invertida (\\").`,
        jsonRuleScriptOnly: (min, max) => `Responda APENAS com um objeto JSON válido com a chave "roteiro" (entre ${min} e ${max} palavras). REGRA CRÍTICA: O roteiro deve ser um texto narrativo limpo, SEM NENHUMA MARCAÇÃO DE CENA OU TEMPO (como '(Introdução)' ou '(0:00-0:30)'). Todas as aspas duplas (") dentro do texto do roteiro devem ser escapadas com uma barra invertida (\\").`,
        seoPrompt: (script) => `Aja como um especialista em SEO do YouTube. Com base no roteiro a seguir: "${script.substring(0, 2000)}...", gere um JSON com "titulo" (um título cativante e otimizado para busca, com no máximo 100 caracteres) e "descricao" (uma descrição otimizada para engajamento, com as palavras-chave mais importantes no início). Responda APENAS com o objeto JSON.`,
        tagsPrompt: (title, description, script) => `Aja como um especialista em SEO para YouTube. Com base no título "${title}", na descrição "${description}" e no roteiro "${script.substring(0, 1500)}...", gere um objeto JSON com a chave "tags". O valor deve ser um array de 10 a 15 tags de vídeo altamente relevantes em português. Inclua tags de cauda curta (1-2 palavras) e de cauda longa (3+ palavras). Garanta que o comprimento total de todas as tags somadas não ultrapasse 480 caracteres. Responda APENAS com o objeto JSON.`,
        extractMainContentPrompt: (rawContent) => `Aja como um editor de texto de alta precisão. Sua única tarefa é extrair o corpo de texto principal do conteúdo a seguir.

REGRAS CRÍTICAS:
1. Ignore completamente as primeiras páginas que contenham título, autor, dedicatória, sumário ou índice. Comece a extração a partir do início do conteúdo principal (geralmente a "Introdução").
2. Remova todos os artefatos de formatação como números de página, cabeçalhos e rodapés.
3. NÃO adicione nenhum título, subtítulo ou marcador que não estivesse na prosa original.
4. O resultado deve ser um texto contínuo, como se fosse um único grande bloco de texto de um livro.
5. Responda APENAS com o texto extraído, sem nenhuma introdução, comentário ou explicação sua.

TEXTO BRUTO PARA PROCESSAR:
---
${rawContent.substring(0, 300000)}
---
`,
        fixedTextPrompt: (fileContent, useOriginal, minWords, maxWords) => {
            let summaryInstruction = useOriginal
                ? `O roteiro DEVE ser o texto limpo fornecido, mas formatado como uma narrativa contínua e fluida, pronta para narração. REGRA CRÍTICA: Remova quaisquer títulos, subtítulos, listas ou marcadores de seção (como 'Introdução:' ou 'Conclusão:') do texto final.`
                : `Sua tarefa é criar um roteiro coeso com aproximadamente ${minWords} a ${maxWords} palavras. Para isso, analise o texto completo fornecido para identificar os temas principais, argumentos centrais e a estrutura narrativa. Em seguida, construa um resumo que capture a essência do texto de forma envolvente, respeitando o limite de palavras. NUNCA adicione informações que não estão no texto original.`;
            
            summaryInstruction += ` O roteiro DEVE começar com uma saudação e um convite para o espectador curtir o vídeo e se inscrever no canal, e terminar com um reforço do convite para se inscrever e ativar as notificações.`;

            return `Aja como um roteirista e especialista em SEO. Com base no conteúdo do arquivo fornecido abaixo, gere um objeto JSON.
INSTRUÇÕES:
1. Crie um "titulo" curto, cativante e otimizado para busca (máximo 100 caracteres).
2. Crie uma "descricao" otimizada para o YouTube.
3. Crie o "roteiro" seguindo esta regra: ${summaryInstruction}
4. O JSON deve ter as chaves "titulo", "descricao" e "roteiro". Responda APENAS com o objeto JSON válido. Todas as aspas duplas (") dentro dos valores de texto devem ser escapadas (\\").
5. REGRA CRÍTICA ADICIONAL: Nunca adicione notas, comentários ou explicações sobre o processo de roteirização no final do texto (como "(O roteiro continuaria...)"). O texto do roteiro deve terminar de forma natural, sem qualquer meta-comentário.

CONTEÚDO DO ARQUIVO (TEXTO PRINCIPAL JÁ EXTRAÍDO):
---
${fileContent.substring(0, 300000)}
---
`;
        },
        fixedTextLiteralPrompt: (fileContent) => `Aja como um especialista em SEO para YouTube. Com base no conteúdo do arquivo fornecido abaixo, gere um objeto JSON.
INSTRUÇÕES:
1. Crie um "titulo" curto, cativante e otimizado para busca (máximo 100 caracteres).
2. Crie uma "descricao" otimizada para o YouTube.
3. O JSON deve ter APENAS as chaves "titulo" e "descricao".
4. Responda APENAS com o objeto JSON válido. Todas as aspas duplas (") dentro dos valores de texto devem ser escapadas (\\").

CONTEÚDO DO ARQUIVO:
---
${fileContent.substring(0, 300000)}
---
`,
        callToAction: {
            science: `O roteiro deve começar com "Se você adora ciência, não esqueça de curtir e se inscrever!" e terminar com "Para mais curiosidades incríveis como esta, não se esqueça de se inscrever e ativar as notificações!".`,
            generic: `O roteiro deve começar com uma saudação e um convite para o espectador curtir o vídeo e se inscrever no canal, e terminar com um reforço do convite para se inscrever e ativar as notificações.`,
            football: `O roteiro deve começar com "Se você é um apaixonado por futebol, já deixa o like..." e terminar com "...Para não perder nenhuma novidade, não se esqueça de curtir e se inscrever!".`,
            fisheries: `O roteiro deve terminar com "A Piscare Importadora traz para você as melhores notícias e os melhores pescados. Para saber mais, visite nosso site em piscareimportacao.com ou entre em contato pelo WhatsApp. Para mais informações e links, confira a descrição deste vídeo. Não se esqueça de curtir e se inscrever no canal para mais novidades do mundo dos pescados!".`
        },
        topicPrompts: {
            science: (avoid) => `Aja como um produtor de conteúdo científico especialista em encontrar nichos inexplorados. O canal já cobriu os tópicos populares. Gere uma lista de 10 títulos de vídeos sobre fatos surpreendentes ou descobertas recentes, focando em interseções de campos (ex: 'A Bioquímica do Medo') ou em tópicos de nicho (ex: 'O Paradoxo do Gato de Botas na Física Quântica'). Os títulos devem ser intrigantes e originais. ${avoid} Responda APENAS com a lista, um título por linha.`,
            stories: (avoid) => `Aja como um autor criativo de livros infantis. O objetivo é criar histórias que fujam do comum. Gere uma lista de 10 títulos originais para novas historinhas. Pense em personagens inusitados (ex: 'O Caracol que Colecionava Ecos') e conflitos criativos (ex: 'A Menina que Precisava Desvendar o Mistério do Riso Perdido'). ${avoid} Responda APENAS com a lista, um título por linha.`,
            freeform: (prompt, avoid) => `Aja como um roteirista criativo. O tema central é "${prompt}". Gere uma lista de 10 títulos de vídeo que abordem este tema de ângulos completamente diferentes, inesperados e de nicho. Evite as abordagens mais óbvias. ${avoid} Responda APENAS com a lista, um título por linha.`
        },
        scriptRequestPrompts: {
            news: (theme, context, avoid, callToAction, jsonRule) => {
                const temaUpper = theme === 'football' ? 'FUTEBOL BRASILEIRO' : 'PESCADOS';
                const temaLower = theme === 'football' ? 'futebol brasileiro' : 'a importância do pescado na alimentação e na economia brasileira';
                if (context) {
                    return `Aja como um redator de notícias. Com base nas seguintes notícias brutas de ${temaUpper}: "${context}". ${avoid} Crie um roteiro de notícias fluído e coeso.\nINSTRUÇÕES PARA O TÍTULO: 1. Analise todas as notícias e identifique o fato mais importante ou a notícia principal. 2. Crie um título que seja DIRETAMENTE baseado neste fato principal. Evite títulos genéricos.\nINSTRUÇÕES PARA O ROTEIRO: 1. NÃO RESUMA OU GENERALIZE. Reescreva os fatos de forma direta e jornalística. 2. OMITA FONTES: Não mencione as fontes das notícias. 3. SEJA FACTUAL: Evite adicionar opiniões ou conteúdo genérico.\n${callToAction} ${jsonRule}`;
                }
                return `Crie um roteiro sobre um tema GERAL e ATUAL sobre ${temaLower}. ${avoid} ${callToAction} ${jsonRule}`;
            }
        },
        searchQueries: {
            football: ['últimas+notícias+futebol+brasileiro', 'mercado+da+bola+brasil', 'transferências+futebol+sul-americano', 'resultados+rodada+campeonato+brasileiro'],
            fisheries: ['tilápia+preço+mercado', 'exportação+pescados+brasil', 'importação+frutos+do+mar', 'crise+pesca+sardinha', 'aquicultura+sustentável', 'legislação+pesca', 'salmão+chileno+brasil', 'mercado+atum', 'camarão+produção+brasil', '']
        },
        prefixMap: { football: 'futebol', science: 'ciencia', freeform: 'generico', stories: 'historinha', fisheries: 'pescado', fixedtext: 'generico' },
        scriptKey: 'roteiro',
        scriptFilename: (safeName) => `roteiro_${safeName}.txt`,
    },
    en: {
        themeNames: {'football':'Football News','fisheries':'Fisheries News','science':'Science Facts','stories':'Children\'s Stories','freeform':'Freeform Prompt', 'fixedtext': 'Fixed Text (upload)'},
        jsonRule: (min, max) => `Respond ONLY with a valid JSON object with the keys "title", "description", and MANDATORILY "script" (between ${min} and ${max} words). CRITICAL RULE: The script must be a clean narrative text, WITHOUT ANY SCENE OR TIME MARKERS (like '(Introduction)' or '(0:00-0:30)'). All double quotes (") inside the text values must be escaped with a backslash (\\"). The entire response must be in ENGLISH.`,
        jsonRuleScriptOnly: (min, max) => `Respond ONLY with a valid JSON object with the key "script" (between ${min} e ${max} palavras). REGRA CRÍTICA: O roteiro deve ser um texto narrativo limpo, SEM NENHUMA MARCAÇÃO DE CENA OU TEMPO (como '(Introdução)' ou '(0:00-0:30)'). Todas as aspas duplas (") dentro do texto do roteiro devem ser escapadas com uma barra invertida (\\"). The entire response must be in ENGLISH.`,
        seoPrompt: (script) => `Act as a YouTube SEO expert. Based on the following script: "${script.substring(0, 2000)}...", generate a JSON object with an optimized "title" (a catchy, search-optimized title, max 100 characters) and "description" (an engaging description with the most important keywords at the beginning). Respond ONLY with the JSON object. The entire response must be in ENGLISH.`,
        tagsPrompt: (title, description, script) => `Act as a YouTube SEO expert. Based on the title "${title}", description "${description}", and script "${script.substring(0, 1500)}...", generate a JSON object with the key "tags". The value must be an array of 10 to 15 highly relevant video tags in English. Include both short-tail (1-2 words) and long-tail (3+ words) tags. Ensure the total character length of all tags combined is under 480 characters. Respond ONLY with the JSON object.`,
        extractMainContentPrompt: (rawContent) => `Act as a high-precision text editor. Your sole task is to extract the main body of text from the following content.

CRITICAL RULES:
1. Completely ignore the first few pages containing the title, author, dedication, table of contents, or index. Start extraction from the beginning of the main content (usually the "Introduction").
2. Remove all formatting artifacts like page numbers, headers, and footers.
3. DO NOT add any titles, subtitles, or section markers that were not in the original prose.
4. The result must be a continuous text, like a single large block of text from a book.
5. Respond ONLY with the extracted text, without any of your own introductions, comments, or explanations.

RAW TEXT TO PROCESS:
---
${rawContent.substring(0, 300000)}
---
`,
        fixedTextPrompt: (fileContent, useOriginal, minWords, maxWords) => {
            let summaryInstruction = useOriginal
                ? `The script MUST be the clean text provided, but formatted as a continuous, flowing narrative ready for voice-over. CRITICAL RULE: Remove any titles, subtitles, lists, or section markers (like 'Introduction:' or 'Conclusion:') from the final text.`
                : `Your task is to create a cohesive script with approximately ${minWords} to ${maxWords} words. To do this, analyze the full text provided to identify the main themes, key arguments, and narrative structure. Then, build a summary that captures the essence of the text in an engaging way, respecting the word limit. NEVER add information that is not in the original text.`;

            summaryInstruction += ` The script MUST begin with a greeting and an invitation for the viewer to like the video and subscribe to the channel, and end with a reinforced call to subscribe and turn on notifications.`;

            return `Act as a scriptwriter and SEO expert. Based on the provided file content below, generate a JSON object.
INSTRUCTIONS:
1. Create a short, catchy, and search-optimized "title" (max 100 characters).
2. Create a YouTube-optimized "description".
3. Create the "script" following this rule: ${summaryInstruction}
4. The JSON must have the keys "title", "description", and "script". Respond ONLY with the valid JSON object. All double quotes (") inside text values must be escaped (\\").
5. ADDITIONAL CRITICAL RULE: Never add notes, comments, or explanations about the scriptwriting process at the end of the text (like "(The script would continue...)"). The script text must end naturally, without any meta-commentary.

FILE CONTENT (MAIN TEXT ALREADY EXTRACTED):
---
${fileContent.substring(0, 300000)}
---
`;
        },
        fixedTextLiteralPrompt: (fileContent) => `Act as a YouTube SEO expert. Based on the provided file content below, generate a JSON object.
INSTRUCTIONS:
1. Create a short, catchy, and search-optimized "title" (max 100 characters).
2. Create a YouTube-optimized "description".
3. The JSON must have ONLY the keys "title" and "description".
4. Respond ONLY with the valid JSON object. All double quotes (") inside text values must be escaped (\\").

FILE CONTENT:
---
${fileContent.substring(0, 300000)}
---
`,
        callToAction: {
            science: `The script must begin with "If you love science, don't forget to like and subscribe!" and end with "For more incredible facts like this, don't forget to subscribe and turn on notifications!".`,
            generic: `The script must begin with a greeting and an invitation for the viewer to like the video and subscribe to the channel, and end with a reinforced call to subscribe and turn on notifications.`,
            football: `The script should begin with "If you're a football fanatic, smash that like button..." and end with "...To never miss an update, don't forget to like and subscribe!".`,
            fisheries: `The script should end with a call to action relevant to a general fisheries news channel, for example, "For more insights into the world of fisheries, subscribe and stay informed. For more information and links, check the description of this video. Don't forget to like and subscribe for more news from the seafood world!".`
        },
        topicPrompts: {
            science: (avoid) => `Act as an expert scientific content producer specializing in finding unexplored niches. The channel has already covered popular topics. Generate a list of 10 intriguing and original video titles about surprising facts or recent discoveries, focusing on intersections of fields (e.g., 'The Biochemistry of Fear') or niche topics (e.g., 'The Puss in Boots Paradox in Quantum Physics'). ${avoid} Respond ONLY with the list, one title per line. All titles must be in ENGLISH.`,
            stories: (avoid) => `Act as a creative children's book author. The goal is to create stories that are out of the ordinary. Generate a list of 10 original titles for new short stories. Think of unusual characters (e.g., 'The Snail Who Collected Echoes') and creative conflicts (e.g., 'The Girl Who Had to Solve the Mystery of the Lost Laughter'). ${avoid} Respond ONLY with the list, one title per line. All titles must be in ENGLISH.`,
            freeform: (prompt, avoid) => `Act as a creative scriptwriter. The central theme is "${prompt}". Gere uma lista de 10 títulos de vídeo que abordem este tema de ângulos completamente diferentes, inesperados e de nicho. Evite as abordagens mais óbvias. ${avoid} Responda APENAS com a lista, um título por linha.`
        },
        scriptRequestPrompts: {
            news: (theme, context, avoid, callToAction, jsonRule) => {
                const temaUpper = theme === 'football' ? 'WORLD FOOTBALL (SOCCER)' : 'FISHERIES';
                const temaLower = theme === 'football' ? 'world football, covering major European and South American leagues' : 'the importance of seafood in the American diet and economy';
                if (context) {
                    return `Act as a sports news writer. Based on the following raw news about ${temaUpper}: "${context}". ${avoid} Create a fluid and cohesive news script.\nTITLE INSTRUCTIONS: 1. Analyze all the news and identify the most important fact or main story. 2. Create a title that is DIRECTLY based on this main fact. Avoid generic titles.\nSCRIPT INSTRUCTIONS: 1. DO NOT SUMMARIZE OR GENERALIZE. Rewrite the facts in a direct, journalistic style. 2. OMIT SOURCES: Do not mention the sources of the news. 3. BE FACTUAL: Avoid adding opinions or generic content.\n${callToAction} ${jsonRule}`;
                }
                return `Create a script about a GENERAL and CURRENT topic in ${temaLower}. ${avoid} ${callToAction} ${jsonRule}`;
            }
        },
        searchQueries: {
            football: ['latest+world+football+soccer+news', 'soccer+transfer+market+rumors', 'major+league+soccer+highlights', 'champions+league+results'],
            fisheries: ['tilapia+price+market', 'us+seafood+exports', 'seafood+imports+usa', 'sardine+fishing+crisis', 'sustainable+aquaculture', 'fishing+legislation+usa', 'chilean+salmon+market', 'tuna+market+trends', 'shrimp+production+gulf', '']
        },
        prefixMap: { football: 'futebol', science: 'ciencia', freeform: 'generico', stories: 'historinha', fisheries: 'pescado', fixedtext: 'generico' },
        scriptKey: 'script',
        scriptFilename: (safeName) => `script_${safeName}.txt`,
    }
};

function getBinaryPath(binaryName) {
    const platform = process.platform;
    if (platform !== 'win32') return isDev ? path.join(__dirname, 'resources', 'bin', binaryName) : path.join(process.resourcesPath, 'bin', binaryName);
    return isDev ? path.join(__dirname, 'resources', 'bin', `${binaryName}.exe`) : path.join(process.resourcesPath, 'bin', `${binaryName}.exe`);
}
const FFMPEG_PATH = getBinaryPath('ffmpeg');
const FFPROBE_PATH = getBinaryPath('ffprobe');
const YT_DLP_PATH = getBinaryPath('yt-dlp');
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
    const zoomFactor = 1.15; 
    const scaledWidth = Math.round(1920 * zoomFactor);
    const scaledHeight = Math.round(1080 * zoomFactor);
    const out_w = 1920;
    const out_h = 1080;
    const pan_x_max = scaledWidth - out_w;
    const pan_y_max = scaledHeight - out_h;

    const direction = Math.floor(Math.random() * 4);
    let x_expr, y_expr;

    switch (direction) {
        case 0: 
            x_expr = `'(${pan_x_max})*t/${duration}'`; 
            y_expr = `'(${pan_y_max})*t/${duration}'`; 
            break;
        case 1: 
            x_expr = `'(${pan_x_max})*(1-t/${duration})'`; 
            y_expr = `'(${pan_y_max})*t/${duration}'`; 
            break;
        case 2: 
            x_expr = `'(${pan_x_max})*t/${duration}'`; 
            y_expr = `'(${pan_y_max})*(1-t/${duration})'`; 
            break;
        case 3: 
            x_expr = `'(${pan_x_max})*(1-t/${duration})'`; 
            y_expr = `'(${pan_y_max})*(1-t/${duration})'`; 
            break;
    }
    return `scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=increase,crop=w=${out_w}:h=${out_h}:x=${x_expr}:y=${y_expr}`;
}

const runCommand = (command, args) => new Promise((resolve, reject) => {
    activeProcess = spawn(command, args);
    let stdout = '';
    let stderr = '';

    activeProcess.stdout.on('data', (data) => {
        stdout += data.toString();
    });

    activeProcess.stderr.on('data', (data) => {
        stderr += data.toString();
    });
    
    activeProcess.on('error', (err) => {
        activeProcess = null;
        reject(err);
    });

    activeProcess.on('close', (code, signal) => {
        activeProcess = null;
        if (signal === 'SIGKILL') {
            return reject(new Error("Processo interrompido forçadamente pelo usuário."));
        }
        if (code === 0) {
            resolve(stdout.trim());
        } else {
            reject(new Error(stderr || `Processo saiu com código ${code}`));
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
        
        const args = ['-ss', timestamp, '-i', videoPath, '-vframes', '1', '-q:v', '2', '-y', frameOutputPath];
        await runCommand(FFMPEG_PATH, args);
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
        let lines = [], currentLine = words[0] || '';
        for (let i = 1; i < words.length; i++) {
            if (currentLine.length + words[i].length < 30) currentLine += ' ' + words[i];
            else { lines.push(currentLine); currentLine = words[i]; }
        }
        lines.push(currentLine);

        const escapeXml = (str) => {
            if (!str) return '';
            return str.replace(/[<>&"']/g, (c) => {
                switch (c) {
                    case '<': return '&lt;';
                    case '>': return '&gt;';
                    case '&': return '&amp;';
                    case '"': return '&quot;';
                    case "'": return '&apos;';
                    default: return c;
                }
            });
        };
        
        const svgText = `<svg width="${width}" height="${height}"><style>.title{fill:${fontColor};font-size:70px;font-weight:bold;font-family:Arial,sans-serif;text-anchor:middle;paint-order:stroke;stroke:#000000;stroke-width:3px;stroke-linecap:butt;stroke-linejoin:miter;}</style>${lines.map((line,index)=>`<text x="50%" y="${height/2-(lines.length-1)*40+index*80}" class="title">${escapeXml(line)}</text>`).join('')}</svg>`;
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

async function generateAiVideoFromImage(imagePath, config, outputPath, webContents, seed = 0, motionIntensity = 40) {
    if (!config.stabilityApiKey) {
        logToRenderer(webContents, '   - Chave da API da Stability AI não fornecida. Pulando geração de vídeo.');
        return null;
    }
    logToRenderer(webContents, `   - Iniciando geração de vídeo com IA (Motion: ${motionIntensity}). Imagem: "${path.basename(imagePath)}"`);

    const apiKey = config.stabilityApiKey;
    const startUrl = "https://api.stability.ai/v2beta/generation/image-to-video";
    const resultUrlBase = "https://api.stability.ai/v2beta/generation/image-to-video/result/";

    try {
        // Passo 1: Enviar a imagem para iniciar a geração
        const formData = new FormData();
        const imageBuffer = await fs.promises.readFile(imagePath); // Lê o arquivo para a memória
        formData.append('image', imageBuffer, { filename: path.basename(imagePath) }); // Envia o buffer
        formData.append('seed', seed.toString());
        formData.append('cfg_scale', "2.5");
        formData.append('motion_bucket_id', motionIntensity.toString());
        
        const startResponse = await fetch(startUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
            },
            body: formData,
        });

        if (startResponse.status !== 200) {
            const errorBody = await startResponse.text();
            throw new Error(`Erro ao iniciar a geração: ${startResponse.status} - ${errorBody}`);
        }

        const responseJSON = await startResponse.json();
        const generationId = responseJSON.id;
        logToRenderer(webContents, `   - Geração iniciada com ID: ${generationId}. Aguardando resultado...`);

        // Passo 2: Verificar o status periodicamente até que esteja concluído
        let videoBuffer = null;
        const maxAttempts = 45; // Tenta por até 45 * 2s = 90 segundos
        const delay = 2000; // 2 segundos de espera entre as verificações

        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, delay));
            
            const resultUrl = `${resultUrlBase}${generationId}`;
            const statusResponse = await fetch(resultUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'video/mp4',
                },
            });
            
            if (statusResponse.status === 202) {
                // 202 Accepted: Geração ainda em progresso
                logToRenderer(webContents, `   - Verificação ${i + 1}/${maxAttempts}: Em andamento...`);
            } else if (statusResponse.status === 200) {
                // 200 OK: Geração concluída, o corpo da resposta é o vídeo
                videoBuffer = await statusResponse.arrayBuffer();
                break; // Sai do loop
            } else {
                // Outro status de erro
                const errorBody = await statusResponse.text();
                throw new Error(`Erro ao verificar o status: ${statusResponse.status} - ${errorBody}`);
            }
        }

        if (!videoBuffer) {
            throw new Error('Tempo limite excedido. A geração do vídeo demorou mais de 90 segundos.');
        }
        
        // Passo 3: Salvar o vídeo
        const videoClipPath = path.join(outputPath, `ai_clip_${seed}.mp4`);
        await fs.promises.writeFile(videoClipPath, Buffer.from(videoBuffer));
        logToRenderer(webContents, `   - ✅ Clipe de vídeo de IA gerado com sucesso: ${videoClipPath}`);
        return videoClipPath;

    } catch (error) {
        logToRenderer(webContents, `   - ❌ ERRO ao gerar vídeo com IA: ${error.message}`);
        return null;
    }
}

async function generateImagePromptsFromScript(script, numPrompts, config, webContents) {
    if (numPrompts <= 0) return [];
    
    const lang = config.language || 'pt-br';
    const langPromptTemplate = lang === 'en-us' 
        ? `Based on the following excerpt from an English script: "{SEGMENT}", create a short, descriptive prompt for an AI image generator. The prompt must capture the main scene and **must be in ENGLISH**. Respond ONLY with the English prompt text.`
        : `Baseado no seguinte trecho de um roteiro em português: "{SEGMENT}", crie um prompt curto e descritivo para um gerador de imagens de IA. O prompt deve capturar a cena principal e ser **obrigatoriamente em INGLÊS**. Responda APENAS com o texto do prompt em inglês.`;

    logToRenderer(webContents, `   - Gerando ${numPrompts} prompts de imagem a partir do roteiro...`);
    const prompts = [];
    const scriptLength = script.length;
    const segmentLength = Math.floor(scriptLength / numPrompts);
    
    for (let i = 0; i < numPrompts; i++) {
        const start = i * segmentLength;
        const end = (i + 1) * segmentLength;
        const segment = script.substring(start, end);
        const finalPrompt = langPromptTemplate.replace('{SEGMENT}', segment);

        try {
            const imagePromptText = await callGeminiPlainText(config, finalPrompt, webContents);
            const enhancedPrompt = `${imagePromptText}, cinematic lighting, digital art, beautiful landscape`;
            prompts.push(enhancedPrompt);
        } catch (error) {
            logToRenderer(webContents, `   - ❌ ERRO ao gerar prompt de imagem para o segmento ${i + 1}: ${error.message}`);
            prompts.push("a beautiful cinematic landscape, digital art");
        }
    }
    return prompts;
}

async function createSlideshowVideo(imagePaths, narrationDuration, outputPath, outputFilename, webContents) {
    const slideshowPath = path.join(outputPath, outputFilename);
    const imageDuration = narrationDuration / imagePaths.length;
    
    let inputArgs = [];
    let filterComplexParts = [];
    imagePaths.forEach((img, i) => {
        inputArgs.push('-loop', '1', '-t', imageDuration.toString(), '-i', img);
        const kenBurnsEffect = getKenBurnsEffect(imageDuration);
        filterComplexParts.push(`[${i}:v]scale=1920:1080,setsar=1,format=yuv420p[s${i}];[s${i}]${kenBurnsEffect},fade=t=in:st=0:d=1,fade=t=out:st=${imageDuration - 1}:d=1[v${i}]`);
    });
    const streamSpecifiers = imagePaths.map((_, i) => `[v${i}]`).join('');
    filterComplexParts.push(`${streamSpecifiers}concat=n=${imagePaths.length}:v=1:a=0[v]`);
    
    const finalArgs = [...inputArgs, '-filter_complex', filterComplexParts.join(';'), '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-y', slideshowPath];
    await runCommand(FFMPEG_PATH, finalArgs);
    return slideshowPath;
}

async function createVideoFromClips(clipPaths, totalDuration, outputPath, outputFilename, webContents) {
    const finalVideoPath = path.join(outputPath, outputFilename);
    const numClips = clipPaths.length;
    if (numClips === 0) return null;

    const fullClipList = [];
    let currentDuration = 0;
    while (currentDuration < totalDuration) {
        for (const clip of clipPaths) {
            fullClipList.push(clip);
            const clipDuration = await getMediaDuration(clip); 
            currentDuration += clipDuration;
            if (currentDuration >= totalDuration) break;
        }
    }
    
    const concatListPath = path.join(outputPath, 'concat_clips.txt');
    const fileListContent = fullClipList.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
    await fs.promises.writeFile(concatListPath, fileListContent);

    const ffmpegArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c', 'copy',
        '-y', finalVideoPath
    ];
    
    await runCommand(FFMPEG_PATH, ffmpegArgs);
    
    await fs.promises.unlink(concatListPath);

    return finalVideoPath;
}

async function selectLocalImagesForSlideshow(theme, directoryPath, count, prefixMap, webContents) {
    if (!directoryPath || !fs.existsSync(directoryPath)) {
        logToRenderer(webContents, `   - AVISO: Pasta de fundos '${directoryPath}' não encontrada ou não configurada.`);
        return [];
    }

    const allImages = new Set();
    const imageFilter = f => /\.(jpg|jpeg|png)$/i.test(f);

    const themeSubfolderName = prefixMap[theme];
    if (themeSubfolderName) {
        const themeFolderPath = path.join(directoryPath, themeSubfolderName);
        if (fs.existsSync(themeFolderPath)) {
            try {
                (await fs.promises.readdir(themeFolderPath)).filter(imageFilter).forEach(file => allImages.add(path.join(themeFolderPath, file)));
            } catch (error) { logToRenderer(webContents, `   - ERRO ao ler subpasta temática '${themeFolderPath}': ${error.message}`); }
        }
    }

    try {
        (await fs.promises.readdir(directoryPath)).filter(imageFilter).forEach(file => allImages.add(path.join(directoryPath, file)));
    } catch (error) { logToRenderer(webContents, `   - ERRO ao ler pasta de fundos raiz '${directoryPath}': ${error.message}`); }

    if (allImages.size === 0) return [];

    let imageArray = Array.from(allImages);
    for (let i = imageArray.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[imageArray[i], imageArray[j]] = [imageArray[j], imageArray[i]]; }
    return imageArray.slice(0, count);
}

function isDuplicateTopic(title, webContents) {
    if (!title) return false;

    const newKeywords = new Set(title.toLowerCase().match(/\b(\w{5,})\b/g) || []);
    if (newKeywords.size === 0) return false;

    let duplicateCount = 0;
    const sessionKeywords = new Set();
    sessionHistory.forEach(t => (t.toLowerCase().match(/\b(\w{5,})\b/g) || []).forEach(kw => sessionKeywords.add(kw)));

    for (const keyword of newKeywords) {
        if (youtubeKeywords.has(keyword) || sessionKeywords.has(keyword)) {
            duplicateCount++;
        }
    }

    const overlapPercentage = (duplicateCount / newKeywords.size) * 100;

    if (overlapPercentage > 50) {
        logToRenderer(webContents, `   - AVISO: Tópico "${title}" descartado por alta similaridade (${overlapPercentage.toFixed(1)}%) com vídeos existentes.`);
        return true;
    }

    return false;
}

async function downloadAudioFromYouTube(url, outputDir, webContents) {
    logToRenderer(webContents, `   - Baixando áudio do YouTube: ${url}`);
    const outputTemplate = path.join(outputDir, `youtube_audio_${Date.now()}.%(ext)s`);
    try {
        const args = ['-x', '--audio-format', 'mp3', '-o', outputTemplate, '--', url];
        await runCommand(YT_DLP_PATH, args);
        const finalPath = outputTemplate.replace('.%(ext)s', '.mp3');
        if (!fs.existsSync(finalPath)) {
            throw new Error('yt-dlp executado, mas o arquivo de saída .mp3 não foi encontrado.');
        }
        logToRenderer(webContents, `   - Áudio do YouTube baixado com sucesso: ${finalPath}`);
        return finalPath;
    } catch (error) {
        logToRenderer(webContents, `   - ❌ ERRO ao baixar áudio do YouTube: ${error.message}`);
        throw error;
    }
}

async function extractAudio(videoPath, outputDir, webContents) {
    logToRenderer(webContents, `   - Extraindo áudio do vídeo: ${path.basename(videoPath)}`);
    const outputPath = path.join(outputDir, `extracted_audio_${Date.now()}.mp3`);
    try {
        const args = ['-i', videoPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', outputPath];
        await runCommand(FFMPEG_PATH, args);
        logToRenderer(webContents, `   - Áudio extraído com sucesso: ${outputPath}`);
        return outputPath;
    } catch (error) {
        logToRenderer(webContents, `   - ❌ ERRO ao extrair áudio: ${error.message}`);
        throw error;
    }
}

async function uploadToGCS(filePath, bucketName, webContents) {
    logToRenderer(webContents, `   - Fazendo upload do áudio para o Google Cloud Storage...`);
    const storage = new Storage();
    const bucket = storage.bucket(bucketName);
    const fileName = path.basename(filePath);
    
    try {
        await bucket.upload(filePath, {
            destination: fileName,
        });
        const gcsUri = `gs://${bucketName}/${fileName}`;
        logToRenderer(webContents, `   - Upload para GCS concluído: ${gcsUri}`);
        return { gcsUri, fileName };
    } catch (error) {
        logToRenderer(webContents, `   - ❌ ERRO no upload para o GCS: ${error.message}`);
        throw error;
    }
}

async function deleteFromGCS(bucketName, fileName, webContents) {
    logToRenderer(webContents, `   - Deletando arquivo do Google Cloud Storage...`);
    const storage = new Storage();
    try {
        await storage.bucket(bucketName).file(fileName).delete();
        logToRenderer(webContents, `   - Arquivo deletado do GCS com sucesso.`);
    } catch (error) {
        logToRenderer(webContents, `   - ⚠️ AVISO: Falha ao deletar arquivo do GCS. Considere apagar manualmente. Erro: ${error.message}`);
    }
}

async function transcribeAudio(audioPath, config, webContents) {
    if (!config.googleSearchApiKey) {
        throw new Error('A "Google Cloud API Key" não foi configurada. Impossível transcrever áudio.');
    }
    logToRenderer(webContents, `   - Transcrevendo áudio... (Isso pode levar alguns minutos)`);
    const client = new speech.SpeechClient({ key: config.googleSearchApiKey });
    const lang = config.language || 'pt-br';
    
    const requestConfig = {
        encoding: 'MP3',
        languageCode: lang,
        enableAutomaticPunctuation: true,
    };

    if (lang === 'en-us') {
        requestConfig.model = 'video';
        logToRenderer(webContents, `   - Usando modelo de transcrição otimizado para vídeo (en-us).`);
    } else {
        logToRenderer(webContents, `   - Usando modelo de transcrição padrão (pt-br).`);
    }

    try {
        const duration = await getMediaDuration(audioPath);
        let transcription = '';

        if (duration > 55) {
            if (!config.gcsBucketName) {
                throw new Error('Áudio com mais de 1 minuto. Por favor, configure o "Nome do Bucket Google Cloud Storage" na aba APIs.');
            }
            logToRenderer(webContents, `   - Áudio longo detectado (${duration.toFixed(0)}s). Usando transcrição assíncrona via GCS.`);
            
            const { gcsUri, fileName } = await uploadToGCS(audioPath, config.gcsBucketName, webContents);
            
            const audio = { uri: gcsUri };
            const request = { audio: audio, config: requestConfig };
            
            const [operation] = await client.longRunningRecognize(request);
            const [response] = await operation.promise();
            
            transcription = response.results.map(result => result.alternatives[0].transcript).join('\n');
            await deleteFromGCS(config.gcsBucketName, fileName, webContents);

        } else {
            logToRenderer(webContents, `   - Áudio curto detectado (${duration.toFixed(0)}s). Usando transcrição síncrona (inline).`);
            const file = await fs.promises.readFile(audioPath);
            const audioBytes = file.toString('base64');
            const audio = { content: audioBytes };
            const request = { audio: audio, config: requestConfig };
            
            const [response] = await client.recognize(request);
            transcription = response.results.map(result => result.alternatives[0].transcript).join('\n');
        }

        if (!transcription) {
            logToRenderer(webContents, '   - AVISO: A transcrição retornou um resultado vazio.');
        } else {
            logToRenderer(webContents, '   - Áudio transcrito com sucesso.');
        }
        return transcription;
    } catch (error) {
        logToRenderer(webContents, `   - ❌ ERRO na transcrição do áudio: ${error.message}`);
        throw error;
    }
}

async function runFullSequence(webContents) {
    if (isProcessing) {
        logToRenderer(webContents, "AVISO: Uma sequência de vídeos já está em andamento. A nova solicitação foi ignorada.");
        return;
    }
    isProcessing = true;
    stopAfterCurrentTask = false; 

    const authorized = await isUserAuthorized(currentRunParams.config, webContents);
    if (!authorized) {
        isProcessing = false;
        webContents.send('automation-stopped'); // Garante que o botão de Iniciar seja reativado
        return; // Interrompe a execução
    }

    let successLog = [];
    let errorLog = [];
    const sessionTimestamp = new Date().toLocaleString();

    if (youtubeKeywords.size === 0 && currentRunParams.config && currentRunParams.config.uploadToYouTube) {
        logToRenderer(webContents, 'Inicializando banco de dados de palavras-chave do YouTube...');
        await checkYouTubeForDuplicates(currentRunParams.config, webContents);
    }
    
    sessionHistory.clear();

    const lang = currentRunParams.config.language || 'pt-br';
    const L = langData[lang.split('-')[0]];

    let themeListForLog = currentThemesList.map(t => L.themeNames[t] || t).join(', ');
    logToRenderer(webContents, `Iniciando geração da sequência completa: ${themeListForLog}`);

    for (const theme of currentThemesList) {
        if (stopAfterCurrentTask) {
            logToRenderer(webContents, "Sequência interrompida pelo usuário antes de iniciar o próximo tema.");
            break; 
        }

        let runParamsForTheme = JSON.parse(JSON.stringify(currentRunParams));
        
        if (runParamsForTheme.config.batchMode) {
            const themeConfigPath = path.join(userDataPath, `${theme}.json`);
            if (fs.existsSync(themeConfigPath)) {
                try {
                    const themeConfigContent = await fs.promises.readFile(themeConfigPath, 'utf8');
                    const themeOverrides = JSON.parse(themeConfigContent);
                    runParamsForTheme.config = { ...runParamsForTheme.config, ...themeOverrides };
                    logToRenderer(webContents, `   - Modo Lote: Carregada e aplicada configuração de '${theme}.json'.`);
                } catch (e) {
                    logToRenderer(webContents, `   - AVISO: Falha ao ler ou processar o arquivo de config de lote '${theme}.json'. Erro: ${e.message}`);
                }
            } else {
                logToRenderer(webContents, `   - Modo Lote: Arquivo '${theme}.json' não encontrado. Usando config padrão.`);
            }
        }
        
        if (theme === 'fixedtext') {
            const source = runParamsForTheme.config.fixedtextPath;
             if (!source || !source.trim()) {
                logToRenderer(webContents, `AVISO: Nenhuma fonte (arquivo, pasta ou link) fornecida para 'Texto Fixo'. Pulando tema.`);
                continue;
            }
            const isUrl = source.startsWith('http');

            if (!isUrl && fs.existsSync(source) && fs.lstatSync(source).isDirectory()) {
                logToRenderer(webContents, `   - Tema 'Texto Fixo': Detectada uma pasta. Iniciando processamento em lote...`);
                try {
                    const files = await fs.promises.readdir(source);
                    const filesToProcess = files
                        .filter(f => /\.(txt|pdf|mp3|m4a|mp4)$/i.test(f))
                        .map(f => path.join(source, f));

                    logToRenderer(webContents, `   - ${filesToProcess.length} arquivos de mídia/texto encontrados.`);
                    
                    for (const filePath of filesToProcess) {
                        if (stopAfterCurrentTask) {
                            logToRenderer(webContents, "   - Interrupção solicitada durante o lote de arquivos. Parando.");
                            break;
                        }
                        let fileParams = JSON.parse(JSON.stringify(runParamsForTheme));
                        fileParams.config.fixedtextPath = filePath;
                        
                        try {
                            const result = await runFullProcess(theme, fileParams, webContents);
                            successLog.push(`[${new Date().toLocaleTimeString()}] SUCESSO: ${path.basename(filePath)} -> ${result.title}`);
                        } catch (fileError) {
                            errorLog.push(`[${new Date().toLocaleTimeString()}] FALHA: ${path.basename(filePath)} - Motivo: ${fileError.message}`);
                            logToRenderer(webContents, `❌ ERRO NO PROCESSAMENTO DO ARQUIVO '${path.basename(filePath)}': ${fileError.message}`);
                            webContents.send('automation-error');
                        }
                    }
                } catch (dirError) {
                    errorLog.push(`[${new Date().toLocaleTimeString()}] FALHA: Leitura da pasta ${source} - Motivo: ${dirError.message}`);
                    logToRenderer(webContents, `❌ ERRO ao ler a pasta de arquivos para 'Texto Fixo': ${dirError.message}`);
                    webContents.send('automation-error');
                }
            } else { 
                try {
                    const result = await runFullProcess(theme, runParamsForTheme, webContents);
                    successLog.push(`[${new Date().toLocaleTimeString()}] SUCESSO: ${source} -> ${result.title}`);
                } catch (error) {
                    errorLog.push(`[${new Date().toLocaleTimeString()}] FALHA: ${source} - Motivo: ${error.message}`);
                    logToRenderer(webContents, `❌ ERRO NO CICLO do tema 'Texto Fixo' para a fonte '${source}': ${error.message}`);
                    webContents.send('automation-error');
                }
            }
        } else {
            try {
                const result = await runFullProcess(theme, runParamsForTheme, webContents);
                successLog.push(`[${new Date().toLocaleTimeString()}] SUCESSO: ${L.themeNames[theme] || theme} -> ${result.title}`);
            } catch (error) {
                errorLog.push(`[${new Date().toLocaleTimeString()}] FALHA: ${L.themeNames[theme] || theme} - Motivo: ${error.message}`);
                logToRenderer(webContents, `❌ ERRO NO CICLO do tema '${L.themeNames[theme] || theme}': ${error.message}`);
                webContents.send('automation-error');
            }
        }
    }
    isProcessing = false;
    
    try {
        const successLogPath = path.join(userDataPath, 'videos_gerados.log');
        const errorLogPath = path.join(userDataPath, 'videos_nao_gerados.log');
        const sessionHeader = `--- NOVA SESSÃO: ${sessionTimestamp} ---\n`;

        if (successLog.length > 0) {
            await fs.promises.appendFile(successLogPath, sessionHeader + successLog.join('\n') + '\n\n');
            logToRenderer(webContents, `   - Log de sucessos salvo em: ${successLogPath}`);
        }
        if (errorLog.length > 0) {
            await fs.promises.appendFile(errorLogPath, sessionHeader + errorLog.join('\n') + '\n\n');
            logToRenderer(webContents, `   - Log de falhas salvo em: ${errorLogPath}`);
        }
    } catch (logError) {
        logToRenderer(webContents, `   - AVISO: Falha ao escrever arquivos de log da sessão: ${logError.message}`);
    }

    if (cronJob && !stopAfterCurrentTask) {
        const nextRun = getNextRunDate(cronJob);
        logToRenderer(webContents, `Sequência completa finalizada. Próxima execução agendada: ${nextRun}`);
    } else if (!stopAfterCurrentTask) {
        logToRenderer(webContents, "Sequência completa finalizada.");
    }
    stopAfterCurrentTask = false;
}

async function selectMediaByTheme(theme, directoryPath, prefixMap, webContents, fallbackToRandom) {
    if (!directoryPath || !fs.existsSync(directoryPath)) return null;

    const themeSubfolderName = prefixMap[theme];

    if (themeSubfolderName) {
        const themeFolderPath = path.join(directoryPath, themeSubfolderName);
        if (fs.existsSync(themeFolderPath)) {
            try {
                const themedFiles = (await fs.promises.readdir(themeFolderPath))
                    .filter(f => /\.(mp4|mov|avi)$/i.test(f));

                if (themedFiles.length > 0) {
                    const chosenFile = themedFiles[Math.floor(Math.random() * themedFiles.length)];
                    logToRenderer(webContents, `   - Vídeo de introdução temático encontrado: ${chosenFile}`);
                    return path.join(themeFolderPath, chosenFile);
                }
            } catch (error) {
                logToRenderer(webContents, `   - ERRO ao ler a subpasta temática '${themeFolderPath}': ${error.message}`);
            }
        }
    }

    if (fallbackToRandom) {
        try {
            const allRootFiles = (await fs.promises.readdir(directoryPath))
                .filter(f => /\.(mp4|mov|avi)$/i.test(f));

            if (allRootFiles.length > 0) {
                const randomFile = allRootFiles[Math.floor(Math.random() * allRootFiles.length)];
                logToRenderer(webContents, `   - Usando vídeo de introdução aleatório da pasta raiz: ${randomFile}`);
                return path.join(directoryPath, randomFile);
            }
        } catch (error) {
            logToRenderer(webContents, `   - ERRO ao ler o diretório de introduções raiz '${directoryPath}': ${error.message}`);
        }
    }
    
    return null;
}

async function generateBrandingVideo(config, baseBackgroundForImage, outputPath, webContents, type) {
    const isIntro = type === 'intro';
    const duration = isIntro ? config.introDuration : config.outroDuration;
    const animation = isIntro ? config.introAnimation : config.outroAnimation;
    const outputFilename = isIntro ? 'branded_intro.mp4' : 'logo_fim.mp4';
    const logPrefix = isIntro ? 'vinheta com marca' : 'finalização com logo';

    const vinhetaPath = config.vinhetaPath;
    const logoPath = config.logoPath;
    const outputFullPath = path.join(outputPath, outputFilename);

    try {
        if (!isIntro) {
            logToRenderer(webContents, `   - Gerando ${logPrefix.toLowerCase()}...`);
            if (!logoPath || !fs.existsSync(logoPath)) {
                logToRenderer(webContents, `   - AVISO: Arquivo de logo (PNG) não encontrado para a finalização. Pulando.`);
                return null;
            }

            let baseInput, baseFilter;
            const isStillImage = /\.(jpg|jpeg|png)$/i.test(baseBackgroundForImage);

            if (isStillImage) {
                baseInput = ['-loop', '1', '-i', baseBackgroundForImage];
                baseFilter = `format=yuv420p,${getKenBurnsEffect(duration)}`;
            } else {
                baseInput = ['-i', baseBackgroundForImage];
                baseFilter = 'loop=loop=-1,trim=duration=' + duration;
            }

            const xPos = '(W-w)/2';
            const yPos = '(H-h)/2';
            let animationFilters = '';

            switch (animation) {
                case 'slide-out-right':
                    animationFilters = `[base][logo]overlay=x='if(lt(t,${duration - 2}),${xPos},${xPos}+(t-(${duration - 2}))*W/2)':y=${yPos}`;
                    break;
                case 'slide-out-bottom':
                    animationFilters = `[base][logo]overlay=x=${xPos}:y='if(lt(t,${duration - 2}),${yPos},${yPos}+(t-(${duration - 2}))*H/2)'`;
                    break;
            }

            const filterComplex = `[0:v]${baseFilter},setpts=PTS-STARTPTS[base];[1:v]scale=960:-1[logo];${animationFilters}`;
            const args = [...baseInput, '-i', logoPath, '-filter_complex', filterComplex, '-t', String(duration), '-an', '-y', outputFullPath];
            await runCommand(FFMPEG_PATH, args);

        } else {
            logToRenderer(webContents, `   - Gerando ${logPrefix.toLowerCase()}...`);
            let baseVideoPath = null;
            let tempBaseCreated = false;

            if (vinhetaPath && fs.existsSync(vinhetaPath)) {
                baseVideoPath = vinhetaPath;
            } else if (baseBackgroundForImage) {
                const tempBaseOutputPath = path.join(outputPath, `temp_base_intro.mp4`);
                const isStillImage = /\.(jpg|jpeg|png)$/i.test(baseBackgroundForImage);
                let baseInput = isStillImage ? ['-loop', '1', '-i', baseBackgroundForImage] : ['-i', baseBackgroundForImage];
                let baseFilter = isStillImage ? `format=yuv420p,${getKenBurnsEffect(duration)}` : 'loop=loop=-1,trim=duration=' + duration;
                await runCommand(FFMPEG_PATH, [...baseInput, '-filter_complex', baseFilter, '-t', String(duration), '-an', '-y', tempBaseOutputPath]);
                baseVideoPath = tempBaseOutputPath;
                tempBaseCreated = true;
            } else {
                logToRenderer(webContents, `   - AVISO: Nenhum vídeo ou imagem base para a vinheta. Pulando.`);
                return null;
            }

            if (!logoPath || !fs.existsSync(logoPath)) {
                logToRenderer(webContents, `   - Apenas padronizando a vinheta principal (sem logo).`);
                const audioFlag = (vinhetaPath && fs.existsSync(vinhetaPath)) ? [] : ['-an'];
                const args = ['-i', baseVideoPath, '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1', ...audioFlag, '-y', outputFullPath];
                await runCommand(FFMPEG_PATH, args);
            
            } else {
                logToRenderer(webContents, `   - Sobrepondo logo animado na vinheta...`);
                const xPos = '(W-w)/2';
                const yPos = '(H-h)/2';
                let animationFilters = '';
                switch (animation) {
                    case 'slide-in-left':
                        animationFilters = `[base][logo]overlay=x='min(${xPos},(-w+(W+w)*t/2))':y=${yPos}`;
                        break;
                    case 'slide-in-top':
                        animationFilters = `[base][logo]overlay=x=${xPos}:y='min(${yPos},(-h+(H+h)*t/2))'`;
                        break;
                }
                const filterComplex = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[base];[1:v]scale=960:-1[logo];${animationFilters}[outv]`;
                
                const args = [
                    '-i', baseVideoPath, 
                    '-i', logoPath, 
                    '-filter_complex', filterComplex,
                    '-map', '[outv]',
                    '-map', '0:a?',
                    '-c:v', 'libx264',
                    '-c:a', 'copy',
                    '-shortest',
                    '-y', outputFullPath
                ];
                await runCommand(FFMPEG_PATH, args);
            }

            if (tempBaseCreated) await fs.promises.unlink(baseVideoPath);
        }

        logToRenderer(webContents, `   - ${logPrefix} gerada com sucesso.`);
        return outputFullPath;

    } catch (error) {
        logToRenderer(webContents, `   - ❌ ERRO ao gerar ${logPrefix.toLowerCase()}: ${error.message}`);
        return null;
    }
}


async function hasAudioStream(filePath) {
    try {
        const args = ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'default=noprint_wrappers=1:nokey=1', filePath];
        const stdout = await runCommand(FFPROBE_PATH, args);
        return stdout.trim() !== '';
    } catch (error) {
        console.error(`Error checking for audio stream in ${filePath}:`, error);
        return false;
    }
}



async function runFullProcess(theme, runParams, webContents) {
    const { duration, config } = runParams;
    const lang = config.language || 'pt-br';
    const L = langData[lang.split('-')[0]];

    if (theme === 'freeform' && !config.freeformPrompt.trim()) {
        logToRenderer(webContents, "AVISO: Tema 'Prompt Livre' pulado pois o texto está vazio.");
        return;
    }
     if (theme === 'fixedtext' && !config.fixedtextPath.trim()) {
        logToRenderer(webContents, "AVISO: Tema 'Texto Fixo' pulado pois nenhuma fonte foi fornecida.");
        return;
    }

    let videoFinalPath, outputPath, thumbnailPath = null, generatedTags = [];
    let storyData = null;
    let chosenMusic = null; 

    try {
        logToRenderer(webContents, "======================================");
        const logTitle = theme === 'fixedtext' ? path.basename(config.fixedtextPath) : L.themeNames[theme].toUpperCase();
        logToRenderer(webContents, `[${new Date().toLocaleString()}] Iniciando ciclo para: ${logTitle} (Idioma: ${lang.toUpperCase()})`);

        let scriptRequestPrompt = '';
        const wordsPerMinute = 150; 
        let targetWordCount = duration * wordsPerMinute; 
        let minWords = Math.round(targetWordCount * 0.9); 
        let maxWords = Math.round(targetWordCount * 1.1);
        
        if (['science', 'stories', 'freeform'].includes(theme)) {
            let uniqueTopic = null;
            let brainstormTries = 3;
            let callToAction = L.callToAction.generic;
            let tempAvoidanceList = [];

            while(brainstormTries-- > 0 && !uniqueTopic) {
                if (stopAfterCurrentTask) throw new Error("Automação interrompida pelo usuário.");

                const tempAvoidanceInstruction = tempAvoidanceList.length > 0 ? ` Adicionalmente, EVITE estes temas já tentados nesta sessão: "${tempAvoidanceList.join('", "')}".` : '';
                const avoidanceInstruction = `Os seguintes temas e palavras-chave já foram abordados e devem ser EVITADOS: "${Array.from(youtubeKeywords).slice(-200).join(', ')}".${tempAvoidanceInstruction}`;

                logToRenderer(webContents, `   - Fase 1: Brainstorm de tópicos de '${L.themeNames[theme]}' com a IA...`);
                let topicPrompt = '';

                switch (theme) {
                    case 'science':
                        topicPrompt = L.topicPrompts.science(avoidanceInstruction);
                        callToAction = L.callToAction.science;
                        break;
                    case 'stories':
                        topicPrompt = L.topicPrompts.stories(avoidanceInstruction);
                        break;
                    case 'freeform':
                        topicPrompt = L.topicPrompts.freeform(config.freeformPrompt, avoidanceInstruction);
                        break;
                }
                
                const topicListText = await callGeminiPlainText(config, topicPrompt, webContents);
                const topics = topicListText.split('\n').map(t => t.replace(/^[0-9-.\s]*/, '').trim()).filter(Boolean);

                for (const topic of topics) {
                    if (!config.uploadToYouTube || config.ignoreDuplicates || !isDuplicateTopic(topic, webContents)) {
                        uniqueTopic = topic;
                        logToRenderer(webContents, `   - Tópico original selecionado: "${uniqueTopic}"`);
                        break;
                    } else {
                        tempAvoidanceList.push(topic);
                    }
                }
                if (!uniqueTopic && brainstormTries > 0) logToRenderer(webContents, `   - AVISO: Nenhum tópico 100% original na lista gerada. Tentando novamente...`);
            }
            if (!uniqueTopic) throw new Error(`Não foi possível gerar um tópico único para o tema '${L.themeNames[theme]}' após várias tentativas.`);
            
            logToRenderer(webContents, '   - Fase 2: Gerando roteiro com o Agente Criativo...');
            const jsonRuleScript = L.jsonRuleScriptOnly(minWords, maxWords);
            scriptRequestPrompt = `Crie um roteiro completo para um vídeo com o tema: "${uniqueTopic}". O roteiro deve ser cativante e informativo. ${callToAction} ${jsonRuleScript}`;
            const scriptData = await callGeminiWithRetries(config, scriptRequestPrompt, webContents);
            
            const scriptContentForSeo = scriptData[L.scriptKey];
            if (!scriptContentForSeo) throw new Error("Agente Criativo falhou em gerar um roteiro.");

            logToRenderer(webContents, '   - Fase 3: Otimizando título e descrição com o Agente de SEO...');
            const seoRequestPrompt = L.seoPrompt(scriptContentForSeo);
            const seoData = await callGeminiWithRetries(config, seoRequestPrompt, webContents);

            storyData = { ...scriptData, ...seoData }; 
        
        } else if (theme === 'fixedtext') {
            logToRenderer(webContents, `   - Fase 1: Processando a fonte de conteúdo...`);
            let rawFileContent = '';
            let tempAudioPath = null;
            const source = config.fixedtextPath;
            const isUrl = source.startsWith('http');
        
            try {
                if (isUrl) {
                    tempAudioPath = await downloadAudioFromYouTube(source, userDataPath, webContents);
                    rawFileContent = await transcribeAudio(tempAudioPath, config, webContents);
                } else {
                    if (!fs.existsSync(source)) throw new Error(`Arquivo ou pasta de origem não encontrado: ${source}`);
                    const fileExtension = path.extname(source).toLowerCase();
                    if (['.mp3', '.m4a'].includes(fileExtension)) {
                        rawFileContent = await transcribeAudio(source, config, webContents);
                    } else if (fileExtension === '.mp4') {
                        tempAudioPath = await extractAudio(source, userDataPath, webContents);
                        rawFileContent = await transcribeAudio(tempAudioPath, config, webContents);
                    } else if (fileExtension === '.txt') {
                        rawFileContent = await fs.promises.readFile(source, 'utf8');
                    } else if (fileExtension === '.pdf') {
                        const dataBuffer = await fs.promises.readFile(source);
                        const pdfData = await pdf(dataBuffer);
                        rawFileContent = pdfData.text;
                    } else {
                        throw new Error(`Formato de fonte não suportado: ${fileExtension}.`);
                    }
                }
            } finally {
                if (tempAudioPath && fs.existsSync(tempAudioPath)) {
                    try { 
                        await fs.promises.unlink(tempAudioPath); 
                        logToRenderer(webContents, `   - Arquivo de áudio temporário deletado: ${tempAudioPath}`);
                    }
                    catch (e) { logToRenderer(webContents, `   - AVISO: Falha ao deletar arquivo de áudio temporário: ${e.message}`);}
                }
            }

            if (!rawFileContent.trim()) {
                throw new Error("A fonte fornecida está vazia ou não contém conteúdo extraível.");
            }
            logToRenderer(webContents, `   - Conteúdo extraído com sucesso.`);

            let extractedContent = rawFileContent; 
            const isTextBasedSource = !isUrl && /\.(txt|pdf)$/i.test(path.extname(source));

            if (isTextBasedSource) {
                logToRenderer(webContents, `   - Fase 2: Extraindo conteúdo principal do arquivo de texto com a IA...`);
                const extractionPrompt = L.extractMainContentPrompt(rawFileContent);
                extractedContent = await callGeminiPlainText(config, extractionPrompt, webContents);
            } else {
                logToRenderer(webContents, `   - Fase 2: Usando transcrição de áudio/vídeo diretamente como conteúdo principal.`);
            }
            
            if (!extractedContent || extractedContent.length < 50) {
                throw new Error("A IA não conseguiu extrair conteúdo válido do arquivo.");
            }
            logToRenderer(webContents, `   - Conteúdo principal extraído com sucesso.`);
            
            if (config.fixedtextUseLiteral && config.fixedtextUseOriginal) {
                logToRenderer(webContents, `   - Modo Texto Literal ativado. Gerando apenas título e descrição...`);
                scriptRequestPrompt = L.fixedTextLiteralPrompt(extractedContent);
                const seoData = await callGeminiWithRetries(config, scriptRequestPrompt, webContents);
                storyData = { ...seoData, [L.scriptKey]: extractedContent };
            } else {
                let useOriginal = config.fixedtextUseOriginal;
                const wordCount = extractedContent.split(/\s+/).length;
                const MAX_WORDS_FOR_ORIGINAL = 3000;

                if (useOriginal && wordCount > MAX_WORDS_FOR_ORIGINAL) {
                    logToRenderer(webContents, `   - AVISO: O texto original (${wordCount} palavras) excede o limite de ~20 minutos. Ativando o modo de resumo para um vídeo de 20 minutos.`);
                    useOriginal = false;
                    minWords = Math.round(MAX_WORDS_FOR_ORIGINAL * 0.9);
                    maxWords = MAX_WORDS_FOR_ORIGINAL + 300; 
                } else if (!useOriginal) {
                    logToRenderer(webContents, `   - Solicitando à IA um resumo de aproximadamente ${duration} minutos (~${targetWordCount} palavras).`);
                } else {
                    logToRenderer(webContents, `   - Usando o texto original limpo (${wordCount} palavras).`);
                }
                
                logToRenderer(webContents, `   - Fase 3: Gerando título, descrição e roteiro com a IA...`);
                scriptRequestPrompt = L.fixedTextPrompt(extractedContent, useOriginal, minWords, maxWords);
                storyData = await callGeminiWithRetries(config, scriptRequestPrompt, webContents);
            }
            
            const potentialTitle = storyData.title || storyData.titulo;
            if (config.uploadToYouTube && !config.ignoreDuplicates && isDuplicateTopic(potentialTitle, webContents)) {
                throw new Error(`Tópico da fonte "${potentialTitle}" parece ser uma duplicata de um vídeo existente. Cancelando.`);
            }

        } else { // Notícias (football, fisheries)
            let newsTries = 3;
            let tempAvoidanceList = [];
            const jsonRuleNews = L.jsonRule(minWords, maxWords);
            
            while(newsTries-- > 0) {
                if (stopAfterCurrentTask) throw new Error("Automação interrompida pelo usuário.");
                const permanentAvoidance = Array.from(youtubeKeywords).concat(Array.from(sessionHistory)).slice(-150).join(', ');
                const temporaryAvoidance = tempAvoidanceList.join(', ');
                const avoidanceInstructionNews = `Estes títulos/temas já foram usados e DEVEM SER EVITADOS: "${permanentAvoidance}". Adicionalmente, EVITE estes temas tentados nesta sessão: "${temporaryAvoidance}". Crie um roteiro com um TÍTULO E ÂNGULO COMPLETAMENTE NOVOS.`;
                let newsContext = null;
                switch(theme) {
                    case 'football':
                        const footballQueries = L.searchQueries.football;
                        const randomFootballQuery = footballQueries[Math.floor(Math.random() * footballQueries.length)]; 
                        logToRenderer(webContents, `   - Buscando notícias com termo aleatório: "${randomFootballQuery}"`);
                        newsContext = await searchGoogleForNews(config, webContents, randomFootballQuery, config.searchEngineId);
                        scriptRequestPrompt = L.scriptRequestPrompts.news('football', newsContext, avoidanceInstructionNews, L.callToAction.football, jsonRuleNews);
                        break;
                    case 'fisheries':
                        if (!config.searchEngineIdFisheries) throw new Error("O 'ID Pesquisa Pescados (Tema 2) (CX)' não foi configurado.");
                        const fisheriesQueries = L.searchQueries.fisheries;
                        const randomFisheriesQuery = fisheriesQueries[Math.floor(Math.random() * fisheriesQueries.length)]; 
                        logToRenderer(webContents, `   - Buscando notícias com termo aleatório: "${randomFisheriesQuery || 'Qualquer novidade'}"`); 
                        newsContext = await searchGoogleForNews(config, webContents, randomFisheriesQuery, config.searchEngineIdFisheries); 
                        scriptRequestPrompt = L.scriptRequestPrompts.news('fisheries', newsContext, avoidanceInstructionNews, L.callToAction.fisheries, jsonRuleNews);
                        break;
                }
                const potentialStoryData = await callGeminiWithRetries(config, scriptRequestPrompt, webContents);
                const potentialTitle = potentialStoryData.title || potentialStoryData.titulo;

                if (!config.uploadToYouTube || config.ignoreDuplicates || !isDuplicateTopic(potentialTitle, webContents)) {
                    storyData = potentialStoryData;
                    break; 
                } else {
                    tempAvoidanceList.push(potentialTitle);
                    logToRenderer(webContents, `   - Tentativa ${3 - newsTries}/3 falhou (duplicata). Tentando encontrar outra notícia...`);
                }
            }
            if (!storyData) {
                throw new Error("Não foi possível gerar uma notícia original após várias tentativas.");
            }
        }
        
        let scriptContent = storyData[L.scriptKey];
        if (!storyData || !scriptContent) throw new Error("A IA não conseguiu gerar um roteiro válido.");
        
        scriptContent = scriptContent.replace(/\\"/g, '"');
        
        logToRenderer(webContents, `   - Aplicando limpeza final no roteiro...`);
        const originalLength = scriptContent.length;

        scriptContent = scriptContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => {
                if (line.length === 0) return false;
                if (line.length < 150 && !/[.!?]$/.test(line)) return false; 
                if (/^(Introdução|Conclusão|Parte \w+|Capítulo \d+)/i.test(line)) return false;
                return true;
            })
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        const newLength = scriptContent.length;
        logToRenderer(webContents, `   - Limpeza final removeu ${originalLength - newLength} caracteres de títulos/marcadores.`);
        
        let storyTitle = storyData.title || storyData.titulo;
        if (storyTitle.length > 100) {
            logToRenderer(webContents, `   - AVISO: Título gerado pela IA é muito longo (${storyTitle.length} caracteres). Truncando para 100.`);
            storyTitle = storyTitle.substring(0, 100).trim();
            storyData[storyData.title ? 'title' : 'titulo'] = storyTitle;
        }

        logToRenderer(webContents, '   - Fase 4: Gerando tags de SEO com o Agente de Tags...');
        try {
            const tagsPrompt = L.tagsPrompt(storyTitle, storyData.description || storyData.descricao, scriptContent);
            const tagsData = await callGeminiWithRetries(config, tagsPrompt, webContents, true); 
            generatedTags = tagsData.tags || [];
            logToRenderer(webContents, `   - Tags geradas: ${generatedTags.join(', ')}`);
        } catch (tagError) {
            logToRenderer(webContents, `   - AVISO: Falha ao gerar tags de SEO. O vídeo será enviado sem tags. Erro: ${tagError.message}`);
            generatedTags = [];
        }

        sessionHistory.add(storyTitle);
        logToRenderer(webContents, `   - Roteiro gerado com sucesso para: "${storyTitle}"`);
        const cleanedScriptForFile = scriptContent.replace(/(\r\n|\n|\r)/gm, " ").replace(/\s+/g, ' ').trim();
        const safeFilename = storyTitle.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 60);
        outputPath = path.join(config.outputDir, `${new Date().toISOString().slice(0, 10)}_${safeFilename}`);
        await fs.promises.mkdir(outputPath, { recursive: true });
        await fs.promises.writeFile(path.join(outputPath, L.scriptFilename(safeFilename)), cleanedScriptForFile);
        
        if (stopAfterCurrentTask) throw new Error("Automação interrompida pelo usuário.");

        const audioPath = path.join(outputPath, `audio_${safeFilename}.mp3`);
        await generateAudioNodeJS(cleanedScriptForFile, audioPath, webContents, theme, config);
        const narrationDuration = await getMediaDuration(audioPath);
        
        if (stopAfterCurrentTask) throw new Error("Automação interrompida pelo usuário.");

        // --- INÍCIO DA LÓGICA DE GERAÇÃO DE MÍDIA MODIFICADA E CORRIGIDA ---
        let chosenBackground = null;
        let baseImagePathForThumbnail = null;
        let baseVideoPathForOutro = null;
        
        // Arrays separados para gerenciar imagens e clipes de forma robusta
        let aiGeneratedImagePaths = []; 
        let aiGeneratedVideoClipPaths = [];

        const prefixMap = langData.pt.prefixMap;
        const imageCount = config.aiImageCount || 3;

        // 1. Priorizar Geração com IA
        if (config.prioritizeAiBackground && config.stabilityApiKey) {
            const imagePrompts = await generateImagePromptsFromScript(cleanedScriptForFile, imageCount, config, webContents);
            if (imagePrompts.length > 0) {
                for (let i = 0; i < imagePrompts.length; i++) {
                    const prompt = imagePrompts[i];
                    const seed = Math.floor(Math.random() * 1000000);
                    const imagePath = await generateAiImage(prompt, config, outputPath, webContents, seed);

                    if (imagePath) {
                        aiGeneratedImagePaths.push(imagePath); // Sempre guardamos a imagem

                        if (config.animateAiImages) {
                            const videoClipPath = await generateAiVideoFromImage(imagePath, config, outputPath, webContents, seed, config.motionIntensity);
                            if (videoClipPath) {
                                aiGeneratedVideoClipPaths.push(videoClipPath);
                            } else {
                                logToRenderer(webContents, '   - AVISO: Falha ao animar imagem, usando a imagem estática como fallback para este segmento.');
                            }
                        }
                    }
                }
            }
        }
        
        // Define as imagens base para thumbnail e outro a partir do que foi gerado
        if (aiGeneratedImagePaths.length > 0) {
            baseImagePathForThumbnail = aiGeneratedImagePaths[0];
            baseVideoPathForOutro = aiGeneratedImagePaths[aiGeneratedImagePaths.length - 1];
        }
        
        if (stopAfterCurrentTask) throw new Error("Automação interrompida pelo usuário.");

        // 2. Processar os caminhos de mídia coletados para criar o fundo principal
        // Se conseguimos animar PELO MENOS UM clipe, montamos um vídeo com os clipes BEM-SUCEDIDOS.
        if (aiGeneratedVideoClipPaths.length > 0) {
            logToRenderer(webContents, `   - Mídia de IA animada. Juntando ${aiGeneratedVideoClipPaths.length} clipes de vídeo...`);
            chosenBackground = await createVideoFromClips(aiGeneratedVideoClipPaths, narrationDuration, outputPath, 'ai_video_background.mp4', webContents);
        } 
        // Se a animação foi tentada mas falhou em todos, ou não foi solicitada, usamos as imagens para um slideshow.
        else if (aiGeneratedImagePaths.length > 0) {
            logToRenderer(webContents, `   - Mídia de IA gerada. Criando slideshow com ${aiGeneratedImagePaths.length} imagens...`);
            chosenBackground = await createSlideshowVideo(aiGeneratedImagePaths, narrationDuration, outputPath, 'slideshow_background.mp4', webContents);
        }
        
        // 3. Se a IA não foi usada ou falhou, tentar slideshow local
        if (!chosenBackground && config.useLocalSlideshow) {
            logToRenderer(webContents, `   - Modo Slideshow Local ativado. Procurando por ${imageCount} imagens...`);
            const localSlideshowImages = await selectLocalImagesForSlideshow(theme, config.backgroundsPath, imageCount, prefixMap, webContents);
            if (localSlideshowImages.length > 0) {
                chosenBackground = await createSlideshowVideo(localSlideshowImages, narrationDuration, outputPath, 'local_slideshow.mp4', webContents);
                baseImagePathForThumbnail = localSlideshowImages[0];
                baseVideoPathForOutro = localSlideshowImages[localSlideshowImages.length - 1];
            } else {
                logToRenderer(webContents, `   - AVISO: Nenhuma imagem local encontrada para o slideshow.`);
            }
        }
        
        if (stopAfterCurrentTask) throw new Error("Automação interrompida pelo usuário.");
        
        // 4. Fallback final para vídeo/imagem de fundo genérico
        if (!chosenBackground) {
            logToRenderer(webContents, '   - Nenhuma mídia gerada/encontrada. Procurando por vídeos/imagens de fundo...');
            const backgroundMedia = await selectMediaByTheme(theme, config.backgroundsPath, prefixMap, webContents, true);
            if (backgroundMedia) {
                chosenBackground = backgroundMedia;
                if (/\.(mp4|mov|avi)$/i.test(chosenBackground)) {
                     baseImagePathForThumbnail = await extractFrameFromVideo(chosenBackground, outputPath, webContents);
                     baseVideoPathForOutro = baseImagePathForThumbnail;
                } else {
                    baseImagePathForThumbnail = chosenBackground;
                    baseVideoPathForOutro = chosenBackground;
                }
            }
        }
        // --- FIM DA LÓGICA DE GERAÇÃO DE MÍDIA MODIFICADA E CORRIGIDA ---

        let introFolderVideoPath = await selectMediaByTheme(theme, config.introPath, langData.pt.prefixMap, webContents, false);
        let brandedIntroVideoPath = null;
        if (config.addLogoIntro && baseImagePathForThumbnail) {
            brandedIntroVideoPath = await generateBrandingVideo(config, baseImagePathForThumbnail, outputPath, webContents, 'intro');
        }

        let outroVideoPath = null;
        if (config.addLogoOutro && baseVideoPathForOutro) {
            outroVideoPath = await generateBrandingVideo(config, baseVideoPathForOutro, outputPath, webContents, 'outro');
        }

        if (runParams.upload && baseImagePathForThumbnail) {
            const thumbOutputPath = path.join(outputPath, 'thumbnail_final.jpg');
            if (config.includeTitleOnThumbnail) {
                const thumbnailColor = getNextThumbnailColor();
                logToRenderer(webContents, `   - Adicionando título à thumbnail com a cor ${thumbnailColor}.`);
                thumbnailPath = await generateThumbnail(baseImagePathForThumbnail, storyTitle, thumbOutputPath, webContents, thumbnailColor);
            } else {
                logToRenderer(webContents, '   - Usando imagem base como thumbnail (sem texto sobreposto).');
                try { await sharp(baseImagePathForThumbnail).resize(1280, 720).toFile(thumbOutputPath); thumbnailPath = thumbOutputPath; } 
                catch (e) { logToRenderer(webContents, `   - ❌ ERRO ao preparar imagem base para thumbnail: ${e.message}`); }
            }
        } else if (runParams.upload) {
            logToRenderer(webContents, `   - AVISO: Não foi possível obter uma imagem base para a thumbnail.`);
        }
        
        const fadeDuration = outroVideoPath ? 1 : 3;
        const totalDurationWithFade = narrationDuration + fadeDuration;
        
        if (!chosenBackground) {
            logToRenderer(webContents, '   - Nenhum fundo encontrado ou gerado. Usando fundo preto.');
            chosenBackground = path.join(outputPath, 'black_bg.mp4');
            await runCommand(FFMPEG_PATH, ['-f', 'lavfi', '-i', `color=c=black:s=1920x1080:r=30`, '-t', totalDurationWithFade.toString(), '-pix_fmt', 'yuv420p', '-y', chosenBackground]);
        }
        
        if (stopAfterCurrentTask) throw new Error("Automação interrompida pelo usuário.");

        const corpoPrincipalPath = path.join(outputPath, `corpo_principal.mp4`);
        const isStillImage = /\.(jpg|jpeg|png)$/i.test(chosenBackground);
        const isVideo = /\.(mp4|mov|avi)$/i.test(chosenBackground);
        
        let backgroundInput = [];
        let backgroundFilter;
        if (isStillImage) {
            backgroundInput = ['-loop', '1', '-i', chosenBackground];
            backgroundFilter = `format=yuv420p,setsar=1,${getKenBurnsEffect(totalDurationWithFade)}`;
        } else if (isVideo) {
            backgroundInput = ['-i', chosenBackground];
            backgroundFilter = 'setsar=1,loop=loop=-1';
        }
        
        let inputs = [...backgroundInput, '-i', audioPath];
        let filterComplex, map;

        if (config.musicasPath && fs.existsSync(config.musicasPath)) { 
            const validMusic = (await fs.promises.readdir(config.musicasPath)).filter(f => /\.(mp3|wav|aac|m4a|flac)$/i.test(f)); 
            if (validMusic.length > 0) chosenMusic = path.join(config.musicasPath, validMusic[Math.floor(Math.random() * validMusic.length)]); 
        }

        if (chosenMusic) {
            inputs.push('-i', chosenMusic);
            filterComplex = `[0:v]${backgroundFilter}[v_story];[1:a]volume=1.5[a_story];[2:a]volume=0.25,aloop=loop=-1:size=2e+09,afade=t=out:st=${narrationDuration}:d=${fadeDuration}[a_bg];[a_story][a_bg]amix=inputs=2:duration=longest[a_mix]`;
            map = ['-map', '[v_story]', '-map', '[a_mix]'];
        } else {
            filterComplex = `[0:v]${backgroundFilter}[v_story];[1:a]volume=1.5,afade=t=out:st=${narrationDuration}:d=${fadeDuration}[a_mix]`;
            map = ['-map', '[v_story]', '-map', '[a_mix]'];
        }
        
        const mainArgs = [...inputs, '-filter_complex', filterComplex, ...map, '-t', totalDurationWithFade.toString(), '-c:v', 'libx264', '-c:a', 'aac', '-b:a', '192k', '-r', '30', '-y', corpoPrincipalPath];
        await runCommand(FFMPEG_PATH, mainArgs);

        if (stopAfterCurrentTask) throw new Error("Automação interrompida pelo usuário.");
        
        let videoParts = [];
        if (introFolderVideoPath) videoParts.push(introFolderVideoPath);
        if (brandedIntroVideoPath) videoParts.push(brandedIntroVideoPath);
        videoParts.push(corpoPrincipalPath);
        if (outroVideoPath) videoParts.push(outroVideoPath);

        videoFinalPath = path.join(outputPath, `video_${safeFilename}.mp4`);
        if (videoParts.length > 1) {
            logToRenderer(webContents, `   - Juntando ${videoParts.length} partes do vídeo...`);
            const concatInputs = videoParts.flatMap(p => ['-i', p]);
            
            let filterParts = [];
            let videoStreams = '';
            let audioStreams = '';

            for (let i = 0; i < videoParts.length; i++) {
                const partPath = videoParts[i];
                videoStreams += `[v${i}]`;
                filterParts.push(`[${i}:v]scale=1920:1080,setsar=1[v${i}]`);

                if (await hasAudioStream(partPath)) {
                    audioStreams += `[${i}:a]`; 
                } else {
                    const partDuration = await getMediaDuration(partPath);
                    filterParts.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${partDuration}[a${i}]`);
                    audioStreams += `[a${i}]`;
                }
            }
            
            const concatFilter = `${filterParts.join(';')};${videoStreams}concat=n=${videoParts.length}:v=1[outv];${audioStreams}concat=n=${videoParts.length}:v=0:a=1[outa]`;

            const concatArgs = [
                ...concatInputs,
                '-filter_complex', concatFilter,
                '-map', '[outv]', '-map', '[outa]',
                '-c:v', 'libx264', '-c:a', 'aac', '-b:a', '192k',
                '-r', '30', '-y', videoFinalPath
            ];
            
            await runCommand(FFMPEG_PATH, concatArgs);
        } else {
            logToRenderer(webContents, '   - Apenas uma parte do vídeo. Renomeando para vídeo final.');
            await fs.promises.rename(videoParts[0], videoFinalPath);
        }

        logToRenderer(webContents, "✨ VÍDEO FINALIZADO COM SUCESSO! ✨");
        webContents.send('video-complete');
        
        if (runParams.upload && videoFinalPath && storyData) {
            const title = storyData.title || storyData.titulo;
            const description = storyData.description || storyData.descricao;
            const playlistId = runParams.config.playlistSelection?.[theme] || null;
            if (playlistId) {
                logToRenderer(webContents, `   - Playlist selecionada para este vídeo: ID ${playlistId}`);
            }
            const uploadSuccess = await uploadToYouTube(videoFinalPath, title, description, generatedTags, runParams.config, webContents, thumbnailPath, playlistId);
            
            if (uploadSuccess) {
                const finalKeywords = (title.toLowerCase().match(/\b(\w{5,})\b/g) || []);
                finalKeywords.forEach(kw => youtubeKeywords.add(kw));
            }

            if (runParams.delete && uploadSuccess) {
                logToRenderer(webContents, `   - Tentando mover pasta do projeto para a lixeira...`);
                if (global.gc) { global.gc(); logToRenderer(webContents, '   - Coletor de lixo invocado para liberar recursos.'); }
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

        return { title: storyTitle };
    } catch (error) {
        throw error;
    }
}

async function handleApiError(response, model, webContents) { if (response.status === 429) { logToRenderer(webContents, `   - AVISO: Limite de cota (Rate Limit) atingido para o modelo ${model}.`); return; } logToRenderer(webContents, `   - Erro na chamada com ${model}. Status: ${response.status}`); }

function cleanAndParseJson(rawText) {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Nenhum bloco JSON encontrado na resposta da API.");
    
    let jsonString = jsonMatch[0];
    
    jsonString = jsonString
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D\u201E]/g, '"')
        .replace(/\\n/g, "\\n")
        .replace(/\\'/g, "\\'")
        .replace(/\\"/g, '\\"')
        .replace(/\\&/g, "\\&")
        .replace(/\\r/g, "\\r")
        .replace(/\\t/g, "\\t")
        .replace(/\\b/g, "\\b")
        .replace(/\\f/g, "\\f");

    jsonString = jsonString.replace(/[\u0000-\u001F]+/g,"");

    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Texto JSON problemático após limpeza:", jsonString);
        throw new Error(`Falha ao fazer parse do JSON limpo: ${error.message}`);
    }
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
                return cleanAndParseJson(rawText);
            } else {
                await handleApiError(response, flashModel, webContents);
                throw new Error(`API retornou status ${response.status}`);
            }
        } catch (error) {
            if (!isSilent) logToRenderer(webContents, `   - AVISO: Tentativa ${i + 1} com Flash falhou: ${error.message}`);
            if (i < flashRetries - 1) {
                const delay = Math.pow(2, i + 1) * 1000 + Math.random() * 1000;
                logToRenderer(webContents, `   - Aguardando ${(delay / 1000).toFixed(1)}s antes de tentar novamente...`);
                await new Promise(resolve => setTimeout(resolve, delay));
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
            return cleanAndParseJson(rawText);
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
    for (let i = 0; i < 3; i++) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiApiKey }, body: JSON.stringify({ contents: [{ parts: [{ text: promptString }] }] }) });
            if (response.ok) {
                const data = await response.json();
                const text = data?.candidates?.[0]?.content?.parts?.[0]?.text.trim();
                if (text) return text;
            } else {
                await handleApiError(response, model, webContents);
                if (i < 2) {
                    const delay = Math.pow(2, i + 1) * 1000 + Math.random() * 1000;
                    logToRenderer(webContents, `   - Aguardando ${(delay / 1000).toFixed(1)}s antes de tentar novamente...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        } catch (error) {
            logToRenderer(webContents, `   - Erro de rede com ${model}: ${error.message}`);
            if (i < 2) {
                const delay = Math.pow(2, i + 1) * 1000 + Math.random() * 1000;
                logToRenderer(webContents, `   - Aguardando ${(delay / 1000).toFixed(1)}s antes de tentar novamente...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw new Error("Falha ao chamar a API Gemini para texto puro após várias tentativas.");
}

async function getMediaDuration(filePath) {
    try {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const args = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath];
        const stdout = await runCommand(FFPROBE_PATH, args);
        const duration = parseFloat(stdout);

        if (isNaN(duration) || duration <= 0) {
            throw new Error(`ffprobe retornou uma duração inválida: ${stdout}`);
        }
        return duration;
    } catch (error) {
        throw new Error(`Falha ao obter a duração da mídia de "${filePath}". Erro: ${error.message}`);
    }
}

async function generateAudioNodeJS(text, outputFile, webContents, theme, config) {
    if (!config.googleSearchApiKey) {
        throw new Error('A "Google Cloud API Key" não foi configurada na aba de APIs. Impossível gerar áudio.');
    }

    let selectedVoice;
    const lang = config.language || 'pt-br';
    
    if (lang === 'en-us') {
        selectedVoice = { languageCode: "en-US", name: "en-US-Wavenet-D" };
    } else {
        selectedVoice = { languageCode: "pt-BR", name: "pt-BR-Wavenet-B" };
    }

    const MAX_BYTES = 4800;
    const textChunks = [];
    let currentChunk = '';

    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    for (const sentence of sentences) {
        if (Buffer.byteLength(currentChunk + sentence, 'utf8') > MAX_BYTES) {
            if (currentChunk) textChunks.push(currentChunk);
            currentChunk = sentence;
        } else {
            currentChunk += sentence;
        }
    }
    if (currentChunk) textChunks.push(currentChunk);

    if (textChunks.length === 1) {
        logToRenderer(webContents, `   - Gerando áudio com a voz ${selectedVoice.name}...`);
        const requestBody = { input: { text: textChunks[0] }, voice: selectedVoice, audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95 } };
        try {
            const apiResponse = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${config.googleSearchApiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
            if (!apiResponse.ok) {
                const errorData = await apiResponse.json();
                throw new Error(`API Text-to-Speech retornou erro ${apiResponse.status}: ${errorData?.error?.message || 'Erro desconhecido'}`);
            }
            const data = await apiResponse.json();
            await fs.promises.writeFile(outputFile, Buffer.from(data.audioContent, 'base64'));
            logToRenderer(webContents, '   - Áudio gerado com sucesso.');
        } catch (error) {
            logToRenderer(webContents, `   - ❌ ERRO FATAL ao gerar áudio: ${error.message}`);
            throw error;
        }
    } else {
        logToRenderer(webContents, `   - Texto muito longo. Gerando áudio em ${textChunks.length} partes para contornar o limite da API...`);
        const audioParts = [];
        const tempDir = path.dirname(outputFile);

        for (let i = 0; i < textChunks.length; i++) {
            logToRenderer(webContents, `     - Gerando parte ${i + 1} de ${textChunks.length}...`);
            const partPath = path.join(tempDir, `audio_part_${i}.mp3`);
            const requestBody = { input: { text: textChunks[i] }, voice: selectedVoice, audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95 } };
            try {
                const apiResponse = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${config.googleSearchApiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
                if (!apiResponse.ok) throw new Error(`API retornou erro na parte ${i+1}`);
                const data = await apiResponse.json();
                await fs.promises.writeFile(partPath, Buffer.from(data.audioContent, 'base64'));
                audioParts.push(partPath);
            } catch (error) {
                 logToRenderer(webContents, `     - ❌ ERRO ao gerar a parte ${i + 1}. Pulando esta parte. Erro: ${error.message}`);
            }
        }
        
        logToRenderer(webContents, '   - Juntando partes do áudio...');
        const concatListPath = path.join(tempDir, 'concat_list.txt');
        const fileListContent = audioParts.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
        await fs.promises.writeFile(concatListPath, fileListContent);

        const ffmpegArgs = ['-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', '-y', outputFile];
        await runCommand(FFMPEG_PATH, ffmpegArgs);
        
        logToRenderer(webContents, '   - Limpando arquivos de áudio temporários...');
        await fs.promises.unlink(concatListPath);
        for(const part of audioParts) {
            await fs.promises.unlink(part);
        }
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
        return data.items.map(item => `Title: ${item.title}\nSnippet: ${item.snippet}`).join('\n\n'); 
    } catch (error) { 
        logToRenderer(webContents, `   - ❌ ERRO na busca na web: ${error.message}`); 
        return null; 
    } 
}

async function uploadToYouTube(videoPath, title, description, tags, config, webContents, thumbnailPath = null, playlistId = null) {
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
                snippet: { title, description: descricaoFinal, tags: tags, categoryId: '24' },
                status: { privacyStatus: 'public' },
            },
            media: { 
                body: videoStream 
            },
        });
        const videoId = response.data.id;
        const channelInfo = config.youtubeChannelName ? `para o canal: ${config.youtubeChannelName}` : '';
        logToRenderer(webContents, `   - ✅ VÍDEO ENVIADO ${channelInfo}! Link: https://www.youtube.com/watch?v=${videoId}`);

        if (playlistId) {
            logToRenderer(webContents, `   - Adicionando vídeo à playlist (ID: ${playlistId})...`);
            try {
                await youtube.playlistItems.insert({
                    part: 'snippet',
                    requestBody: {
                        snippet: {
                            playlistId: playlistId,
                            resourceId: {
                                kind: 'youtube#video',
                                videoId: videoId
                            }
                        }
                    }
                });
                logToRenderer(webContents, '   - ✅ Vídeo adicionado à playlist com sucesso!');
            } catch (playlistError) {
                logToRenderer(webContents, `   -⚠️ AVISO: Falha ao adicionar vídeo à playlist. Erro: ${playlistError.message}`);
            }
        }

        if (thumbnailPath) {
            logToRenderer(webContents, '   - Aguardando 5 segundos antes de enviar a thumbnail...');
            await new Promise(resolve => setTimeout(resolve, 5000));

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
        const nextDates = job.nextDates(1);
        if (nextDates && nextDates.length > 0) {
            const nextDateLuxon = nextDates[0];
            if (nextDateLuxon && nextDateLuxon.isValid) {
                return nextDateLuxon.toFormat('dd/MM/yyyy HH:mm:ss');
            }
        }
    } catch (e) {
        console.error("Não foi possível determinar a próxima execução do cron:", e);
    }
    return 'indeterminada';
}

function startAutomationTask(webContents, runData) {
    if (cronJob) cronJob.stop();

    currentThemesList = [...runData.config.selectedThemes];
    currentRunParams = runData;
    const scheduleIsValid = cron.validate(runData.schedule);

    if (!runData.runImmediately && !scheduleIsValid) {
        webContents.send('invalid-schedule', runData.schedule);
        return;
    }
    
    if (scheduleIsValid) {
        cronJob = cron.schedule(runData.schedule, () => runFullSequence(webContents), { timezone: "America/Sao_Paulo" });
        logToRenderer(webContents, `Automação agendada. Próxima execução: ${getNextRunDate(cronJob)}`);
    } else if (runData.runImmediately) {
        logToRenderer(webContents, 'AVISO: Nenhuma hora válida selecionada. A automação será executada apenas uma vez e não será agendada.');
    }

    if (runData.runImmediately) {
        runFullSequence(webContents);
    }
    
    webContents.send('automation-started');
}

function stopAutomation(event, force) {
    if (force) {
        if (cronJob) {
            cronJob.stop();
            cronJob = null;
        }

        stopAfterCurrentTask = true; 

        if (activeProcess) {
            logToRenderer(event.sender, "Enviando sinal de interrupção para o processo FFmpeg...");
            activeProcess.kill('SIGKILL'); 
            activeProcess = null;
        }
        
        isProcessing = false;
        event.sender.send('automation-stopped');
        
    } else {
        if(cronJob) {
            cronJob.stop();
            cronJob = null;
        }
        stopAfterCurrentTask = true;
        logToRenderer(event.sender, "Interrupção agendada. A automação parará após o vídeo atual.");
        if (!isProcessing) {
            stopAfterCurrentTask = false;
            event.sender.send('automation-stopped');
        }
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
    if (!isDev) {
        Menu.setApplicationMenu(null);
    }
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
  if (activeProcess) activeProcess.kill('SIGKILL');
  if (authServer) authServer.close();
});

ipcMain.on('set-dirty-state', (event, isDirty) => { isConfigDirty = isDirty; });
ipcMain.handle('select-folder', async () => (await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })).filePaths[0]);

ipcMain.handle('select-file', async (event, options) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: options.filters
    });
    return canceled ? null : filePaths[0];
});

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
        if (authServer) {
            authServer.close();
            authServer = null;
            logToRenderer(event.sender, 'Processo de login cancelado pelo usuário.');
        }

        youtubeKeywords.clear();
        sessionHistory.clear();
        logToRenderer(event.sender, 'Cache de vídeos recentes (em memória) foi limpo.');

        let config = {};
        if (fs.existsSync(configPath)) {
            config = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
        }
        delete config.youtubeRefreshToken;
        delete config.youtubeChannelName;
        delete config.playlistSelection;
        await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2));

        event.sender.send('config-updated', config);
        logToRenderer(event.sender, 'Logout do YouTube efetuado com sucesso.');
    } catch (err) {
        logToRenderer(event.sender, `ERRO ao deslogar/cancelar: ${err.message}`);
    }
});

async function fetchAndSendPlaylists(webContents, oauth2Client) {
    try {
        logToRenderer(webContents, '   - Buscando playlists do canal...');
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
        const playlistResponse = await youtube.playlists.list({
            part: 'snippet,id',
            mine: true,
            maxResults: 50
        });
        if (playlistResponse.data.items && playlistResponse.data.items.length > 0) {
            const playlists = playlistResponse.data.items.map(p => ({
                id: p.id,
                title: p.snippet.title
            }));
            webContents.send('youtube-playlists-loaded', playlists);
            logToRenderer(webContents, `   - ${playlists.length} playlists encontradas.`);
        } else {
            logToRenderer(webContents, '   - Nenhuma playlist encontrada no canal.');
            webContents.send('youtube-playlists-loaded', []);
        }
    } catch (playlistError) {
        logToRenderer(webContents, `   - AVISO: Falha ao buscar playlists: ${playlistError.message}`);
        webContents.send('youtube-playlists-loaded', []);
    }
}

ipcMain.on('get-youtube-playlists', async (event, config) => {
    if (config.youtubeClientId && config.youtubeClientSecret && config.youtubeRefreshToken) {
        try {
            const oauth2Client = new google.auth.OAuth2(config.youtubeClientId, config.youtubeClientSecret, REDIRECT_URI);
            oauth2Client.setCredentials({ refresh_token: config.youtubeRefreshToken });
            await fetchAndSendPlaylists(event.sender, oauth2Client);
        } catch (error) {
            logToRenderer(event.sender, `ERRO ao reautenticar para buscar playlists: ${error.message}`);
        }
    } else {
        logToRenderer(event.sender, 'AVISO: Credenciais insuficientes para buscar playlists na inicialização.');
    }
});


ipcMain.on('youtube-login', (event, credentials) => { 
    if (authServer) {
        logToRenderer(event.sender, 'AVISO: Um processo de login já está em andamento. Se o problema persistir, reinicie o app.');
        return;
    }
    const oauth2Client = new google.auth.OAuth2(credentials.clientId, credentials.clientSecret, REDIRECT_URI); 
    
    authServer = http.createServer(async (req, res) => { 
        try { 
            const code = new URL(req.url, REDIRECT_URI).searchParams.get('code'); 
            if (!code) {
                res.end('Código de autenticação não encontrado na URL.');
                return;
            }; 
            res.end('<h1>Autenticação concluída!</h1><p>Pode fechar esta aba e retornar ao aplicativo.</p>'); 
            
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
            
            await fetchAndSendPlaylists(event.sender, oauth2Client);
            await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2)); 
            event.sender.send('config-updated', config); 

        } catch (e) { 
            logToRenderer(event.sender, `ERRO na autenticação: ${e.message}`); 
        } finally { 
            if (authServer) {
                authServer.close();
                authServer = null;
            }
        } 
    })
    .listen(3000, () => {
        shell.openExternal(oauth2Client.generateAuthUrl({ access_type:'offline', prompt:'consent', scope:['https://www.googleapis.com/auth/youtube'] }));
    })
    .on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            logToRenderer(event.sender, '❌ ERRO: A porta 3000 já está em uso. Se você acabou de fechar o app, aguarde um momento. Se o erro persistir, outro programa pode estar usando a porta.');
        } else {
            logToRenderer(event.sender, `ERRO no servidor de autenticação: ${err.message}`);
        }
        if (authServer) {
            authServer.close();
            authServer = null;
        }
    });
});
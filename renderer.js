// renderer.js - VERSÃO FINAL COM SUPORTE A MÍDIA E YOUTUBE

// Função global para abas, precisa estar fora do DOMContentLoaded
function openTab(evt, tabName) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tab-link");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(tabName).style.display = "flex";
    evt.currentTarget.className += " active";
}

document.addEventListener('DOMContentLoaded', () => {
    // Objeto de traduções
    const translations = { appTitle: { pt: 'Video Creator App', en: 'Video Creator App' }, appTitleH1: { pt: 'Video Creator App', en: 'Video Creator App' }, startAutomationBtn: { pt: 'INICIAR AUTOMAÇÃO', en: 'START AUTOMATION' }, stopAutomationBtn: { pt: 'PARAR AUTOMAÇÃO', en: 'STOP AUTOMATION' }, helpBtn: { pt: 'Ajuda', en: 'Help' }, saveBtn: { pt: 'Salvar', en: 'Save' }, saveAsBtn: { pt: 'Salvar Como...', en: 'Save As...' }, openBtn: { pt: 'Abrir...', en: 'Open...' }, settingsTitle: { pt: 'Configurações', en: 'Settings' }, mediaTab: { pt: 'Mídia', en: 'Media' }, mediaFoldersTitle: { pt: 'Pastas de Arquivos', en: 'File Folders' }, musicFolderLabel: { pt: 'Pasta de Músicas:', en: 'Music Folder:' }, introsFolderLabel: { pt: 'Pasta de Introduções:', en: 'Intros Folder:' }, backgroundsFolderLabel: { pt: 'Pasta de Fundos:', en: 'Backgrounds Folder:' }, outputFolderLabel: { pt: 'Pasta de Saída:', en: 'Output Folder:' }, musicFolderPlaceholder: { pt: 'Opcional', en: 'Optional' }, introsFolderPlaceholder: { pt: 'Opcional', en: 'Optional' }, backgroundsFolderPlaceholder: { pt: 'Opcional', en: 'Optional' }, outputFolderPlaceholder: { pt: 'Obrigatório', en: 'Required' }, selectBtn: { pt: 'Selecionar', en: 'Select' }, customBrandingTitle: { pt: "Branding com Logo", en: "Branding with Logo" }, vinhetaFileLabel: { pt: "Vinheta Principal (Vídeo Opcional):", en: "Main Sting (Optional Video):" }, vinhetaFilePlaceholder: { pt: "Opcional: Selecione um vídeo. Se vazio, um fundo será gerado.", en: "Optional: Select a video file. If empty, a background will be generated." }, logoFileLabel: { pt: "Logo para Sobrepor (PNG):", en: "Overlay Logo (PNG):" }, logoFilePlaceholder: { pt: "Opcional: Selecione um arquivo .png com transparência.", en: "Optional: Select a .png file with transparency." }, addLogoIntroCheckbox: { pt: "Adicionar Vinheta com Logo", en: "Add Branded Sting" }, addLogoOutroCheckbox: { pt: "Adicionar Finalização com Logo", en: "Add Outro with Logo" }, durationLabel: { pt: "Duração (s):", en: "Duration (s):" }, animationLabel: { pt: "Animação:", en: "Animation:" }, animSlideInLeft: { pt: "Deslizar da Esquerda", en: "Slide In from Left" }, animSlideInTop: { pt: "Deslizar de Cima", en: "Slide In from Top" }, animSlideOutRight: { pt: "Deslizar para Direita", en: "Slide Out to Right" }, animSlideOutBottom: { pt: "Deslizar para Baixo", en: "Slide Out to Bottom" }, aiGenerationTitle: { pt: 'Geração de Fundo com IA', en: 'AI Background Generation' }, aiImagesLabel: { pt: 'Imagens da IA:', en: 'AI Images:' }, backgroundOptionsLabel: { pt: 'Opções de Fundo:', en: 'Background Options:' }, localSlideshowCheckbox: { pt: 'Montar slideshow com imagens existentes', en: 'Create slideshow from existing images' }, randomizeCheckbox: { pt: 'Randomizar', en: 'Randomize' }, prioritizeAiCheckbox: { pt: 'Priorizar IA', en: 'Prioritize AI' }, 
        animateAiImagesCheckbox: { pt: 'Animar imagens de IA (Custo Adicional)', en: 'Animate AI Images (Additional Cost)' },
        animateAiImagesTooltip: { pt: 'Converte cada imagem de IA gerada em um clipe de vídeo curto (3-4s). Aumenta significativamente o custo e o tempo de geração. O custo por vídeo é de aproximadamente 25 créditos por clipe na Stability AI.', en: 'Converts each generated AI image into a short video clip (3-4s). Significantly increases generation cost and time. The cost per video is approximately 25 credits per clip on Stability AI.' },
        motionIntensityLabel: { pt: 'Intensidade do Movimento: ', en: 'Movement Intensity: ' },
        startupTitle: { pt: 'Inicialização', en: 'Startup' }, startupWinCheckbox: { pt: 'Iniciar com o Windows', en: 'Start with Windows' }, startupAutoCheckbox: { pt: 'Iniciar Automação ao abrir', en: 'Start Automation on open' }, youtubeLoginTitle: { pt: 'YouTube Login & Descrição (Padrão)', en: 'YouTube Login & Default Description' }, loginBtn: { pt: 'Login', en: 'Login' }, logoutBtn: { pt: 'Deslogar', en: 'Logout' }, youtubeStatusNotConnected: { pt: 'Não conectado.', en: 'Not connected.' }, youtubeStatusConnected: { pt: 'Conectado como: {channelName}', en: 'Connected as: {channelName}' }, includeTitleOnThumbnailCheckbox: { pt: 'Incluir título na thumbnail', en: 'Include title on thumbnail' }, 
        ignoreDuplicatesCheckbox: { pt: 'Ignorar duplicidade', en: 'Ignore duplicates' },
        ignoreDuplicatesTooltip: { pt: 'Marque esta caixa para forçar a criação de um vídeo mesmo que o sistema detecte um título muito similar a um vídeo já existente no seu canal. Use com cuidado para evitar conteúdo repetitivo.', en: 'Check this box to force video creation even if the system detects a title that is very similar to an existing video on your channel. Use with caution to avoid repetitive content.' },
        youtubeDefaultDescLabel: { pt: 'Descrição Padrão (Opcional):', en: 'Default Description (Optional):' }, youtubeDefaultDescPlaceholder: { pt: 'Este texto será adicionado ao final da descrição gerada. Ex: Links de afiliado, redes sociais...', en: 'This text will be added at the end of the generated description. Ex: Affiliate links, social media...' }, apiKeysTitle: { pt: 'Chaves de API (Configuração Padrão)', en: 'API Keys (Default Configuration)' }, footballSearchIdLabel: { pt: 'ID Pesquisa Futebol (Tema 1) (CX):', en: 'Football Search ID (Theme 1) (CX):' }, fisheriesSearchIdLabel: { pt: 'ID Pesquisa Pescados (Tema 2) (CX):', en: 'Fisheries News (Theme 2) (CX):' }, optionalPlaceholder: { pt: 'Opcional', en: 'Optional' }, 
        gcsBucketNameLabel: { pt: 'Nome do Bucket Google Cloud Storage (para áudios > 1 min):', en: 'Google Cloud Storage Bucket Name (for audio > 1 min):' },
        gcsBucketNamePlaceholder: { pt: 'Ex: meu-bucket-de-transcricao', en: 'Ex: my-transcription-bucket' },
        authTitle: { pt: 'Autorização de Acesso', en: 'Access Authorization' },
        userEmailLabel: { pt: 'Seu Email de Assinante:', en: 'Your Subscriber Email:' },
        userEmailPlaceholder: { pt: 'seu.email@exemplo.com', en: 'your.email@example.com' },
        controlTitle: { pt: 'Controle', en: 'Control' }, batchModeCheckbox: { pt: 'Carregar Parâmetros de Lote sequencial', en: 'Load Sequential Batch Parameters' }, contentTypesLabel: { pt: 'Tipos de Conteúdo (sequencial):', en: 'Content Types (sequential):' }, 
        themeStories: { pt: "Historinhas Infantis", en: "Children's Stories" }, 
        themeFootball: { pt: 'Notícias de Futebol (Tema 1)', en: 'Football News (Theme 1)' }, 
        themeFisheries: { pt: 'Notícias de Pescados (Tema 2)', en: 'Fisheries News (Theme 2)' }, 
        themeScience: { pt: 'Curiosidades Científicas', en: 'Science Facts' }, 
        themeFreeform: { pt: 'Prompt Livre', en: 'Freeform Prompt' },
        themeFixedtext: { pt: 'Texto Fixo (upload)', en: 'Fixed Text (upload)' },
        videoLanguageLabel: { pt: 'Idioma do Vídeo:', en: 'Video Language:' }, 
        freeformMainTheme: { pt: 'Tema Principal:', en: 'Main Theme:' }, freeformMainThemePlaceholder: { pt: 'Ex: A história da invenção do avião', en: 'Ex: The history of the invention of the airplane' }, freeformScriptStyle: { pt: 'Estilo do Roteiro:', en: 'Script Style:' }, styleOptionNews: { pt: 'Noticiário / Informativo', en: 'News / Informative' }, styleOptionDoc: { pt: 'Documentário / Narrativo', en: 'Documentary / Narrative' }, styleOptionList: { pt: 'Lista (Top 5, etc.)', en: 'List (Top 5, etc.)' }, styleOptionStory: { pt: 'Conto / História', en: 'Tale / Story' }, freeformVideoTone: { pt: 'Tom do Vídeo:', en: 'Video Tone:' }, toneOptionSerious: { pt: 'Sério / Jornalístico', en: 'Serious / Journalistic' }, toneOptionInspiring: { pt: 'Inspirador / Otimista', en: 'Inspiring / Optimistic' }, toneOptionCurious: { pt: 'Curioso / Educacional', en: 'Curious / Educational' }, toneOptionCasual: { pt: 'Casual / Conversado', en: 'Casual / Conversational' }, toneOptionDark: { pt: 'Sombrio / Misterioso', en: 'Dark / Mysterious' }, freeformTargetAudience: { pt: 'Público-Alvo:', en: 'Target Audience:' }, freeformTargetAudiencePlaceholder: { pt: 'Ex: Iniciantes em tecnologia, fãs de história', en: 'Ex: Tech beginners, history buffs' }, 
        fixedtextSourceLabel: { pt: 'Fonte (.txt, .pdf, .mp3, m4a, mp4), Pasta ou Link do YouTube.', en: 'Source (.txt, .pdf, .mp3, m4a, mp4), Folder, or YouTube Link.' },
        fixedtextSourcePlaceholder: { pt: 'Cole um link do YouTube aqui OU use os botões abaixo', en: 'Paste a YouTube link here OR use the buttons below' },
        selectFileBtn: { pt: 'Arquivo...', en: 'File...' },
        selectFolderBtn: { pt: 'Pasta...', en: 'Folder...' },
        fixedtextOriginalCheckbox: { pt: 'Usar conteúdo original', en: 'Use original content' },
        fixedtextLiteralCheckbox: { pt: 'Texto Literal (sem IA no roteiro)', en: 'Literal Text (no AI on script)' },
        fixedtextOriginalTooltip: { pt: 'Ao selecionar, o conteúdo exato do arquivo (ou a transcrição completa do áudio/vídeo) será usado. Se o texto for maior que 20 minutos, ele será resumido automaticamente para essa duração.', en: 'When checked, the exact content of the file (or the full transcript of the audio/video) will be used. If the text exceeds 20 minutes, it will be automatically summarized to that duration.' },
        mediaFoldersTooltip: { pt: 'Para organização, crie subpastas com nomes específicos (ex: "futebol", "ciencia") dentro das pastas de Mídia. Veja mais na Ajuda (item 4).', en: 'For organization, create subfolders with specific names (e.g., "football", "science") inside the Media folders. See Help (item 4) for more.' },
        batchModeTooltip: { pt: 'Permite que cada tema use uma configuração e canal do YouTube diferente. Requer arquivos .json nomeados por tema (ex: "football.json"). Veja mais na Ajuda (item 6).', en: 'Allows each theme to use a different configuration and YouTube channel. Requires theme-named .json files (e.g., "football.json"). See Help (item 6) for more.' },
        scheduleLabel: { pt: 'Horários (selecione um ou mais):', en: 'Schedule (select one or more):' }, presetAll: { pt: 'Todos', en: 'All' }, presetNone: { pt: 'Nenhum', en: 'None' }, presetWork: { pt: 'Comercial', en: 'Work Hours' }, presetNight: { pt: 'Madrugada', en: 'Night Hours' }, durationLabelMain: { pt: 'Duração (minutos):', en: 'Duration (minutes):' }, frequencyLabel: { pt: 'Frequência:', en: 'Frequency:' }, freqDaily: { pt: 'Diária', en: 'Daily' }, freqWeekly: { pt: 'Semanal', en: 'Weekly' }, freqMonthly: { pt: 'Mensal', en: 'Monthly' }, dayOfWeekLabel: { pt: 'Dia da Semana:', en: 'Day of Week:' }, daySun: { pt: 'Domingo', en: 'Sunday' }, dayMon: { pt: 'Segunda', en: 'Monday' }, dayTue: { pt: 'Terça', en: 'Tuesday' }, dayWed: { pt: 'Quarta', en: 'Wednesday' }, dayThu: { pt: 'Quinta', en: 'Thursday' }, dayFri: { pt: 'Sexta', en: 'Friday' }, daySat: { pt: 'Sábado', en: 'Saturday' }, dayOfMonthLabel: { pt: 'Dia do Mês:', en: 'Day of Month:' }, uploadToYouTubeCheckbox: { pt: 'Enviar para o YouTube após criar', en: 'Upload to YouTube after creation' }, deleteAfterUploadCheckbox: { pt: 'Apagar pasta local após upload', en: 'Delete local folder after upload' }, videosGeneratedLabel: { pt: 'Vídeos Gerados Nesta Sessão', en: 'Videos Generated This Session' }, errorsLabel: { pt: 'Vídeos Não Gerados por Erros', en: 'Videos Not Generated Due to Errors' }, logTitle: { pt: 'Log de Atividades', en: 'Activity Log' }, helpTitle: { pt: 'Como Obter as Chaves de API', en: 'How to Get API Keys' }, helpGeminiTitle: { pt: '1. Chave da API do Gemini', en: '1. Gemini API Key' }, helpGeminiDesc: { pt: 'Para evitar os limites do plano gratuito (ex: 50 requisições/dia), é altamente recomendado habilitar o faturamento no seu projeto do Google Cloud.', en: 'To avoid the free plan limits (e.g., 50 requests/day), enabling billing on your Google Cloud project is highly recommended.' }, helpGeminiStep1: { pt: 'Acesse o <a href="https://console.cloud.google.com/billing" target="_blank">Google Cloud Billing</a> e configure uma conta de faturamento.', en: 'Go to <a href="https://console.cloud.google.com/billing" target="_blank">Google Cloud Billing</a> and set up a billing account.' }, helpGeminiStep2: { pt: 'Vincule seu projeto a esta conta de faturamento.', en: 'Link your project to this billing account.' }, helpGeminiStep3: { pt: 'Acesse o <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a>.', en: 'Go to the <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a>.' }, helpGeminiStep4: { pt: 'Clique em <strong>"Create API key"</strong> no projeto correto.', en: 'Click <strong>"Create API key"</strong> in the correct project.' }, helpGeminiStep5: { pt: 'Copie a chave gerada e cole no campo "Gemini AI:".', en: 'Copy the generated key and paste it into the "Gemini AI:" field.' }, helpGoogleApiTitle: { pt: '2. Chave de API do Google Cloud e IDs de Pesquisa', en: '2. Google Cloud API Key and Search Engine IDs' }, helpGoogleApiDesc: { pt: '<strong>IMPORTANTE:</strong> Para separar as notícias, você precisará criar <strong>dois Mecanismos de Pesquisa Programáveis</strong>, um para cada tema.', en: '<strong>IMPORTANT:</strong> To separate news topics, you will need to create <strong>two Programmable Search Engines</strong>, one for each theme.' }, helpGoogleApiPartA: { pt: 'Parte A: Chave da API (para Voz e Pesquisa)', en: 'Part A: API Key (for Voice and Search)' }, helpGoogleApiStepA1: { pt: 'Acesse o <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a> e selecione seu projeto.', en: 'Go to the <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a> and select your project.' }, helpGoogleApiStepA2: { pt: 'No menu de navegação, vá para <strong>APIs e Serviços > Biblioteca</strong>. Procure e <strong>ATIVE</strong> as seguintes duas APIs: <code>Custom Search API</code> e <code>Cloud Text-to-Speech API</code>.', en: 'In the navigation menu, go to <strong>APIs & Services > Library</strong>. Search for and <strong>ENABLE</strong> the following two APIs: <code>Custom Search API</code> and <code>Cloud Text-to-Speech API</code>.' }, helpGoogleApiStepA3: { pt: 'Depois de ativadas, vá para <strong>APIs e Serviços > Credenciais</strong> e clique em <strong>+ CRIAR CREDENCIAIS > Chave de API</strong>.', en: 'Once enabled, go to <strong>APIs & Services > Credentials</strong> and click <strong>+ CREATE CREDENTIALS > API key</strong>.' }, helpGoogleApiStepA4: { pt: 'Copie a chave gerada e cole no campo "Google Cloud API Key:". Esta chave única servirá para a geração de voz e para os mecanismos de pesquisa.', en: 'Copy the generated key and paste it into the "Google Cloud API Key:" field. This single key will work for both voice generation and the search engines.' }, helpGoogleApiPartB: { pt: 'Parte B: IDs dos Mecanismos de Pesquisa (CX)', en: 'Part B: Search Engine IDs (CX)' }, helpGoogleApiStepB1: { pt: 'Acesse o <a href="https://programmablesearchengine.google.com/" target="_blank">Mecanismo de Pesquisa Programável</a>.', en: 'Go to the <a href="https://programmablesearchengine.google.com/" target="_blank">Programmable Search Engine</a> control panel.' }, helpGoogleApiStepB2: { pt: '<strong>Para Futebol (Tema 1):</strong> Crie um mecanismo e em "Sites para pesquisar", adicione sites de esporte (Ex: <code>ge.globo.com/futebol/*</code>, <code>espn.com/soccer/*</code>). Copie o ID gerado para o campo "ID Pesquisa Futebol (Tema 1) (CX)".', en: '<strong>For Football (Theme 1):</strong> Create a new engine and under "Sites to search," add sports websites (e.g., <code>espn.com/soccer/*</code>, <code>goal.com/*</code>). Copy the generated ID into the "Football Search ID (Theme 1) (CX)" field.' }, helpGoogleApiStepB3: { pt: '<strong>Para Pescados (Tema 2):</strong> Crie um <strong>segundo</strong> mecanismo e em "Sites para pesquisar", adicione sites de agronegócio, economia e alimentos (Ex: <code>g1.globo.com/economia/agronegocios/*</code>, <code>seafoodsource.com/*</code>). Copie o novo ID gerado para o campo "ID Pesquisa Pescados (Tema 2) (CX)".', en: '<strong>For Fisheries (Theme 2):</strong> Create a <strong>second</strong> engine and under "Sites to search," add agribusiness, economy, and food websites (e.g., <code>undercurrentnews.com/*</code>, <code>seafoodsource.com/*</code>). Copy the new ID into the "Fisheries Search ID (Theme 2) (CX)" field.' }, 
        helpGoogleApiPartC: { pt: 'Parte C: Bucket do Google Cloud Storage (Obrigatório para áudios longos)', en: 'Part C: Google Cloud Storage Bucket (Required for long audio)' },
        helpGcsDesc: { pt: 'Para transcrever áudios ou vídeos com mais de 60 segundos, a API de Voz do Google exige que o arquivo seja enviado para um "bucket" de armazenamento. Este é um passo único.', en: 'To transcribe audio or videos longer than 60 seconds, the Google Speech API requires the file to be uploaded to a storage "bucket". This is a one-time setup step.' },
        helpGcsStep1: { pt: 'No <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a>, procure por <strong>Cloud Storage</strong> e clique em <strong>Buckets</strong>.', en: 'In the <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a>, search for <strong>Cloud Storage</strong> and click <strong>Buckets</strong>.' },
        helpGcsStep2: { pt: 'Clique em <strong>+ CRIAR</strong>. Dê um <strong>nome único global</strong> ao seu bucket (ex: <code>audios-transcricao-meuprojeto123</code>). Anote este nome.', en: 'Click <strong>+ CREATE</strong>. Give your bucket a <strong>globally unique name</strong> (e.g., <code>myaudio-transcription-bucket-123</code>). Write this name down.' },
        helpGcsStep3: { pt: 'Escolha a localização mais próxima de você (ex: <code>southamerica-east1</code> para São Paulo).', en: 'Choose a location closest to you (e.g., <code>us-central1</code>).' },
        helpGcsStep4: { pt: 'Mantenha as outras opções como padrão (Standard, Uniform) e clique em <strong>CRIAR</strong>.', en: 'Keep the other options as default (Standard, Uniform) and click <strong>CREATE</strong>.' },
        helpGcsStep5: { pt: 'Copie o nome exato que você deu ao bucket e cole no campo "Nome do Bucket Google Cloud Storage:" no aplicativo.', en: 'Copy the exact name you gave the bucket and paste it into the "Google Cloud Storage Bucket Name:" field in the application.' },
        helpYoutubeTitle: { pt: '3. Credenciais do YouTube (Client ID e Secret)', en: '3. YouTube Credentials (Client ID and Secret)' }, helpYoutubeDesc: { pt: '<strong>Atenção:</strong> a funcionalidade de verificação de duplicidade de vídeos requer a permissão de "leitura" do seu canal. Ao fazer login pela primeira vez com esta versão, você precisará re-autorizar o acesso na tela do Google.', en: '<strong>Attention:</strong> The video duplicate check feature requires "read" permission for your channel. When logging in for the first time with this version, you will need to re-authorize access on the Google screen.' }, helpYoutubeStep1: { pt: 'No mesmo projeto do Google Cloud, vá para <strong>APIs e Serviços > Biblioteca</strong>, procure por <code>YouTube Data API v3</code> e clique em <strong>ATIVAR</strong>.', en: 'In the same Google Cloud project, go to <strong>APIs & Services > Library</strong>, search for <code>YouTube Data API v3</code>, and click <strong>ENABLE</strong>.' }, helpYoutubeStep2: { pt: 'Vá para <strong>APIs e Serviços > Tela de permissão OAuth</strong>. Selecione <strong>Externo</strong>, preencha os dados e na etapa "Usuários de teste", clique em <strong>+ ADD USERS</strong> e adicione o seu próprio e-mail do Google.', en: 'Go to <strong>APIs & Services > OAuth consent screen</strong>. Select <strong>External</strong>, fill in the details, and in the "Test users" step, click <strong>+ ADD USERS</strong> and add your own Google email.' }, helpYoutubeStep3: { pt: 'Agora vá para <strong>APIs e Serviços > Credenciais</strong>. Clique em <strong>+ CRIAR CREDENCIAIS > ID do cliente OAuth</strong>.', en: 'Now go to <strong>APIs & Services > Credentials</strong>. Click <strong>+ CREATE CREDENTIALS > OAuth client ID</strong>.' }, helpYoutubeStep4: { pt: 'Em "Tipo de aplicativo", selecione <strong>App para computador</strong>.', en: 'For "Application type," select <strong>Desktop app</strong>.' }, helpYoutubeStep5: { pt: 'Após criar, copie o <strong>Client ID</strong> e <strong>Client Secret</strong> para os campos do aplicativo.', en: 'After creating, copy the <strong>Client ID</strong> and <strong>Client Secret</strong> into the application fields.' }, helpMediaTitle: { pt: '4. Organizando Seus Arquivos de Mídia', en: '4. Organizing Your Media Files' }, helpMediaDesc1: { pt: '<strong>Pastas Padrão:</strong> Para facilitar, o app cria automaticamente as pastas <code>musicas</code>, <code>introducoes</code>, e <code>fundos</code> na sua pasta de dados de usuário (mesmo local do <code>config.json</code>). Os caminhos para elas são preenchidos automaticamente.', en: '<strong>Default Folders:</strong> To make things easier, the app automatically creates <code>musicas</code>, <code>introducoes</code>, and <code>fundos</code> folders in your user data folder (the same place where <code>config.json</code> is saved). The paths to these folders are filled in automatically.' }, helpMediaDesc2: { pt: '<strong>Organização por Tema (Recomendado):</strong> Para que o app selecione introduções e fundos que correspondam ao tema do vídeo, crie subpastas dentro da sua "Pasta de Fundos" e "Pasta de Introduções" com os seguintes nomes exatos (em minúsculas):', en: '<strong>Organization by Theme (Recommended):</strong> For the app to select intros and backgrounds that match the video\'s theme, create subfolders inside your \'Backgrounds Folder\' and \'Intros Folder\' with the following exact names (in lowercase):' }, helpMediaList: { pt: '<ul><li><code>futebol</code> (para Notícias de Futebol)</li><li><code>pescado</code> (para Notícias de Pescados)</li><li><code>ciencia</code> (para Curiosidades Científicas)</li><li><code>historinha</code> (para Historinhas Infantis)</li><li><code>generico</code> (para Prompt Livre e Texto Fixo)</li></ul>', en: '<ul><li><code>futebol</code> (for Football News)</li><li><code>pescado</code> (for Fisheries News)</li><li><code>ciencia</code> (for Science Facts)</li><li><code>historinha</code> (for Children\'s Stories)</li><li><code>generico</code> (for Freeform Prompt and Fixed Text)</li></ul>' }, helpMediaHowItWorks: { pt: '<strong>Como Funciona:</strong> Ao criar um vídeo de futebol, o app procurará um arquivo aleatório dentro da pasta <code>.../fundos/futebol/</code>. Se esta pasta não existir ou estiver vazia, ele usará um arquivo aleatório da pasta raiz <code>.../fundos/</code> como alternativa. Para introduções, se a subpasta temática não for encontrada, nenhuma introdução da pasta será usada para evitar temas incorretos.', en: '<strong>How it Works:</strong> When creating a football video, the app will look for a random file inside the <code>.../fundos/futebol/</code> folder. If this folder doesn\'t exist or is empty, it will use a random file from the root <code>.../fundos/</code> folder as an alternative. For intros, if the themed subfolder isn\'t found, no intro from the folder will be used to avoid incorrect themes.' }, helpStabilityTitle: { pt: '5. Chave da API da Stability AI (Opcional)', en: '5. Stability AI API Key (Optional)' }, helpStabilityDesc: { pt: 'Esta chave é necessária para gerar imagens e vídeos de fundo com Inteligência Artificial. Se deixada em branco, essa funcionalidade será desativada.', en: 'This key is required to generate background images and videos with Artificial Intelligence. If left blank, this feature will be disabled.' }, helpStabilityStep1: { pt: 'Acesse a plataforma da Stability AI em <a href="https://platform.stability.ai/" target="_blank">platform.stability.ai</a>.', en: 'Access the Stability AI platform at <a href="https://platform.stability.ai/" target="_blank">platform.stability.ai</a>.' }, helpStabilityStep2: { pt: 'Faça login ou crie uma nova conta.', en: 'Log in or create a new account.' }, helpStabilityStep3: { pt: 'No menu da sua conta (geralmente no canto superior direito), clique em <strong>"API Keys"</strong>.', en: 'In your account menu (usually in the top right corner), click on <strong>"API Keys"</strong>.' }, helpStabilityStep4: { pt: 'Copie a sua chave de API. Ela se parecerá com <code>sk-...</code>', en: 'Copy your API key. It will look something like <code>sk-...</code>' }, helpStabilityStep5: { pt: 'Cole a chave no campo "Stability AI:" no aplicativo.', en: 'Paste the key into the "Stability AI:" field in the application.' }, 
        helpBatchTitle: { pt: '6. Modo Lote & Playlists', en: '6. Batch Mode & Playlists' }, 
        helpBatchDesc1: { pt: 'Esta funcionalidade permite que cada tipo de conteúdo use uma configuração específica (incluindo canal do YouTube, pasta de saída, descrição padrão e até mesmo a playlist de destino) dentro de uma única execução em lote. <strong>Importante: O agendamento principal (horários, frequência) definido no Painel de Controle ainda é o que comanda a execução.</strong> Os arquivos de lote apenas definem <em>o que</em> será gerado em cada horário agendado.', en: 'This feature allows each content type to use a specific configuration (including YouTube channel, output folder, default description, and even the destination playlist) within a single batch run. <strong>Important: The main schedule (hours, frequency) set in the Control Panel is still what commands the execution.</strong> The batch files only define <em>what</em> will be generated at each scheduled time.' },
        helpBatchStep2: { pt: 'Na pasta de dados do aplicativo (a mesma onde o <code>config.json</code> principal é salvo), crie arquivos <code>.json</code> para cada tema que você deseja personalizar.', en: 'In the application\'s data folder (the same one where the main <code>config.json</code> is saved), create <code>.json</code> files for each theme you want to customize.' }, 
        helpBatchStep3: { pt: 'Os nomes dos arquivos devem ser exatos: <code>football.json</code>, <code>fisheries.json</code>, <code>science.json</code>, <code>stories.json</code>, <code>freeform.json</code>, <code>fixedtext.json</code>.', en: 'The filenames must be exact: <code>football.json</code>, <code>fisheries.json</code>, <code>science.json</code>, <code>stories.json</code>, <code>freeform.json</code>, <code>fixedtext.json</code>.' }, 
        helpBatchStep4: { 
            pt: 'Dentro de cada arquivo, adicione apenas os campos que você deseja sobrescrever. <strong>Exemplo de um arquivo `fisheries.json` que envia para um canal e playlist específicos:</strong>', 
            en: 'Inside each file, add only the fields you want to override. <strong>Example of a `fisheries.json` file that uploads to a specific channel and playlist:</strong>' 
        }, 
        
        helpBrandingTitle: { pt: '7. Como funcionam as Vinhetas e Finalizações', en: '7. How Stings and Outros Work' }, 
        helpBrandingDesc: { pt: 'A seção "Branding com Logo" permite criar introduções e finalizações de forma flexível. A ordem de montagem do vídeo final é:', en: 'The "Branding with Logo" section allows for flexible creation of intros and outros. The final video assembly order is:' }, 
        helpBrandingOrder1: { pt: '<strong>1. Introdução da Pasta:</strong> Um vídeo temático da sua "Pasta de Introduções".', en: '<strong>1. Folder Intro:</strong> A themed video from your "Intros Folder".' }, 
        helpBrandingOrder2: { pt: '<strong>2. Vinheta com Logo:</strong> A vinheta criada na seção "Branding", que vem logo após a introdução da pasta.', en: '<strong>2. Branded Sting:</strong> The sting created in the "Branding" section, which comes right after the folder intro.' }, 
        helpBrandingOrder3: { pt: '<strong>3. Corpo do Vídeo:</strong> O conteúdo principal gerado.', en: '<strong>3. Main Video Body:</strong> The main generated content.' }, 
        helpBrandingOrder4: { pt: '<strong>4. Finalização com Logo:</strong> Um clipe final com sua marca.', en: '<strong>4. Outro with Logo:</strong> A final clip with your brand.' }, 
        helpBrandingIntroTitle: { pt: 'Configurando a "Vinheta com Logo"', en: 'Configuring the "Branded Sting"' }, 
        helpBrandingIntroDesc: { pt: 'Você tem três opções principais ao marcar "Adicionar Vinheta com Logo":', en: 'You have three main options when checking "Add Branded Sting":' }, 
        helpBrandingIntroOpt1: { pt: '<strong>Vídeo + Logo (Recomendado):</strong> Selecione um vídeo em "Vinheta Principal" e um PNG em "Logo para Sobrepor". O aplicativo irá animar seu logo por cima do seu vídeo. O áudio original do vídeo será mantido.', en: '<strong>Video + Logo (Recommended):</strong> Select a video in "Main Sting" and a PNG in "Overlay Logo". The app will animate your logo on top of your video. The video\'s original audio will be kept.' }, 
        helpBrandingIntroOpt2: { pt: '<strong>Apenas Vinheta (Vídeo):</strong> Selecione um vídeo em "Vinheta Principal" e deixe o campo "Logo para Sobrepor" em branco. O aplicativo usará seu vídeo como uma vinheta simples, sem animação de logo.', en: '<strong>Sting Only (Video):</strong> Select a video in "Main Sting" and leave the "Overlay Logo" field blank. The app will use your video as a simple sting, without any logo animation.' }, 
        helpBrandingIntroOpt3: { pt: '<strong>Apenas Logo (Imagem):</strong> Deixe "Vinheta Principal" em branco e selecione um PNG em "Logo para Sobrepor". O aplicativo criará um fundo animado (baseado no conteúdo do vídeo) e aplicará seu logo sobre ele.', en: '<strong>Logo Only (Image):</strong> Leave "Main Sting" blank and select a PNG in "Overlay Logo". The app will create an animated background (based on the main video content) and apply your logo over it.' }, 
        helpBrandingOutroTitle: { pt: 'Configurando a "Finalização com Logo"', en: 'Configuring the "Outro with Logo"' }, 
        helpBrandingOutroDesc: { pt: 'Esta opção funciona de forma mais simples. Ela sempre precisa de uma imagem (PNG) no campo "Logo para Sobrepor". Ela irá gerar um fundo animado (baseado no conteúdo do vídeo) e aplicar seu logo com a animação de saída escolhida. O campo "Vinheta Principal" é ignorado para a finalização.', en: 'This option works more simply. It always requires an image (PNG) in the "Overlay Logo" field. It will generate an animated background (based on the main video content) and apply your logo with the chosen outro animation. The "Main Sting" field is ignored for the outro.' },
    };

    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const helpButton = document.getElementById('helpButton');
    const logArea = document.getElementById('log');
    const youtubeLoginButton = document.getElementById('youtubeLoginButton');
    const youtubeLogoutButton = document.getElementById('youtubeLogoutButton');

    const pathInputs = {
        musicasPath: document.getElementById('musicasPath'),
        introPath: document.getElementById('introPath'),
        backgroundsPath: document.getElementById('backgroundsPath'),
        outputDir: document.getElementById('outputDir'),
        vinhetaPath: document.getElementById('vinhetaPath'),
        logoPath: document.getElementById('logoPath'),
    };

    const themeCheckboxes = document.querySelectorAll('.theme-checkbox');
    
    const freeformPromptContainer = document.getElementById('freeform-prompt-container');
    const freeformCheckbox = document.getElementById('theme-freeform');
    
    const fixedtextContainer = document.getElementById('fixedtext-container');
    const fixedtextCheckbox = document.getElementById('theme-fixedtext');
    const fixedtextSelectFileButton = document.getElementById('fixedtext-select-file-button');
    const fixedtextSelectFolderButton = document.getElementById('fixedtext-select-folder-button');
    const fixedtextSourceInput = document.getElementById('fixedtext-source-input');

    const fixedtextOriginalCheckbox = document.getElementById('fixedtext-original-checkbox');
    const fixedtextLiteralCheckbox = document.getElementById('fixedtext-literal-checkbox');
    
    const startupWinCheckbox = document.getElementById('startupWinCheckbox');
    const startupAutoCheckbox = document.getElementById('startupAutoCheckbox');

    const useLocalSlideshowCheckbox = document.getElementById('useLocalSlideshowCheckbox');
    const prioritizeAiCheckbox = document.getElementById('prioritizeAiCheckbox');
    const randomizeCheckbox = document.getElementById('randomizeBackgroundCheckbox');
    const backgroundOptions = [useLocalSlideshowCheckbox, prioritizeAiCheckbox, randomizeCheckbox];
    
    const aiAnimationControls = document.getElementById('ai-animation-controls');
    const animateAiImagesCheckbox = document.getElementById('animateAiImagesCheckbox');
    const motionIntensitySlider = document.getElementById('motionIntensity');
    const motionIntensityValue = document.getElementById('motionIntensityValue');

    const addLogoIntroCheckbox = document.getElementById('addLogoIntroCheckbox');
    const addLogoOutroCheckbox = document.getElementById('addLogoOutroCheckbox');
    const introDurationInput = document.getElementById('introDuration');
    const introAnimationSelect = document.getElementById('introAnimation');
    const outroDurationInput = document.getElementById('outroDuration');
    const outroAnimationSelect = document.getElementById('outroAnimation');

    const batchModeCheckbox = document.getElementById('batchModeCheckbox');
    
    const langPtBtn = document.getElementById('lang-pt-br');
    const langEnBtn = document.getElementById('lang-en-us');

    const helpModal = document.getElementById('helpModal');
    const closeHelpModal = document.getElementById('closeHelpModal');
    
    const tooltipElement = document.getElementById('custom-tooltip');

    let currentConfig = {};
    let lastSavedConfigString = '';
    let isCurrentlyDirty = false;
    let videosGenerated = 0;
    let errorsEncountered = 0;

    function setLanguage(lang) {
        const langCode = lang.startsWith('en') ? 'en' : 'pt';
        document.querySelectorAll('[data-i18n-key]').forEach(element => {
            const key = element.dataset.i18nKey;
            if (translations[key] && translations[key][langCode]) {
                const translation = translations[key][langCode];
                if (element.placeholder !== undefined && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')) {
                    element.placeholder = translation;
                } 
                else if (element.tagName !== 'INPUT' && element.tagName !== 'TEXTAREA') {
                    if (element.classList.contains('btn-text')) {
                        element.textContent = translation;
                    } else {
                        const btnText = element.querySelector('.btn-text');
                        if (btnText) {
                            btnText.textContent = translation;
                        } else {
                            element.innerHTML = translation;
                        }
                    }
                }
            }
        });

        document.documentElement.lang = langCode;
        if (currentConfig.youtubeChannelName) {
            document.getElementById('youtubeStatus').textContent = translations.youtubeStatusConnected[langCode].replace('{channelName}', currentConfig.youtubeChannelName);
        } else {
            document.getElementById('youtubeStatus').textContent = translations.youtubeStatusNotConnected[langCode];
        }
        document.querySelectorAll('.tooltip-trigger').forEach(el => {
            const key = el.dataset.tooltipKey;
            if (translations[key] && translations[key][langCode]) {
                setupTooltip(el, translations[key][langCode]);
            }
        });
    }

    const scheduleHoursGrid = document.getElementById('schedule-hours-grid');
    for (let i = 0; i < 24; i++) {
        const hour = i.toString().padStart(2, '0');
        const hourItem = document.createElement('div');
        hourItem.className = 'hour-item';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox'; checkbox.id = `hour-${i}`; checkbox.value = i; checkbox.className = 'hour-checkbox';
        const label = document.createElement('label');
        label.htmlFor = `hour-${i}`; label.textContent = `${hour}h`;
        hourItem.appendChild(checkbox); hourItem.appendChild(label);
        scheduleHoursGrid.appendChild(hourItem);
    }

    function setButtonLoading(button, isLoading) {
        if (!button) return;
        const text = button.querySelector('.btn-text');
        const spinner = button.querySelector('.spinner');
        if (isLoading) {
            button.disabled = true;
            if (text) text.style.display = 'none';
            if (spinner) spinner.style.display = 'inline-block';
        } else {
            button.disabled = false;
            if (text) text.style.display = 'inline-block';
            if (spinner) spinner.style.display = 'none';
        }
    }
    
    function updateYoutubeButtonStates(isLoggedIn, isLoggingIn = false) {
        if (isLoggingIn) {
            setButtonLoading(youtubeLoginButton, true);
            youtubeLogoutButton.disabled = false;
        } else if (isLoggedIn) {
            setButtonLoading(youtubeLoginButton, false);
            youtubeLoginButton.disabled = true;
            youtubeLogoutButton.disabled = false;
        } else { 
            setButtonLoading(youtubeLoginButton, false);
            youtubeLoginButton.disabled = false;
            youtubeLogoutButton.disabled = true;
        }
    }

    function collectUIConfig() {
        const newConfig = {
            youtubeRefreshToken: currentConfig.youtubeRefreshToken,
            youtubeChannelName: currentConfig.youtubeChannelName,
        };
        Object.keys(pathInputs).forEach(key => { newConfig[key] = pathInputs[key].value.trim(); });
        newConfig.geminiApiKey = document.getElementById('geminiApiKey').value;
        newConfig.googleSearchApiKey = document.getElementById('googleSearchApiKey').value;
        newConfig.searchEngineId = document.getElementById('searchEngineId').value;
        newConfig.searchEngineIdFisheries = document.getElementById('searchEngineIdFisheries').value;
        newConfig.youtubeClientId = document.getElementById('youtubeClientId').value;
        newConfig.youtubeClientSecret = document.getElementById('youtubeClientSecret').value;
        newConfig.gcsBucketName = document.getElementById('gcsBucketName').value;
        
        newConfig.stabilityApiKey = document.getElementById('stabilityApiKey').value;
        newConfig.aiImageCount = parseInt(document.getElementById('aiImageCount').value, 10) || 1;
        newConfig.useLocalSlideshow = useLocalSlideshowCheckbox.checked;
        newConfig.prioritizeAiBackground = prioritizeAiCheckbox.checked;
        newConfig.randomizeBackground = randomizeCheckbox.checked;
        
        if (animateAiImagesCheckbox) { // Verifica se o elemento existe (não está comentado)
            newConfig.animateAiImages = animateAiImagesCheckbox.checked;
            newConfig.motionIntensity = parseInt(motionIntensitySlider.value, 10);
        }

        newConfig.addLogoIntro = addLogoIntroCheckbox.checked;
        newConfig.introDuration = parseInt(introDurationInput.value, 10) || 5;
        newConfig.introAnimation = introAnimationSelect.value;
        newConfig.addLogoOutro = addLogoOutroCheckbox.checked;
        newConfig.outroDuration = parseInt(outroDurationInput.value, 10) || 5;
        newConfig.outroAnimation = outroAnimationSelect.value;

        newConfig.selectedThemes = Array.from(themeCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
        newConfig.language = document.querySelector('.lang-btn.active').id === 'lang-pt-br' ? 'pt-br' : 'en-us';
        newConfig.freeformPrompt = document.getElementById('freeform-prompt-input').value;
        newConfig.freeformStyle = document.getElementById('freeform-style').value;
        newConfig.freeformTone = document.getElementById('freeform-tone').value;
        newConfig.freeformAudience = document.getElementById('freeform-audience').value;
        
        newConfig.fixedtextPath = fixedtextSourceInput.value;
        newConfig.fixedtextUseOriginal = fixedtextOriginalCheckbox.checked;
        newConfig.fixedtextUseLiteral = fixedtextLiteralCheckbox.checked;

        newConfig.batchMode = batchModeCheckbox.checked;

        newConfig.audioDuration = document.getElementById('audioDuration').value;
        newConfig.uploadToYouTube = document.getElementById('uploadToYouTubeCheckbox').checked;
        newConfig.deleteAfterUpload = document.getElementById('deleteAfterUploadCheckbox').checked;
        newConfig.includeTitleOnThumbnail = document.getElementById('includeTitleOnThumbnailCheckbox').checked;
        newConfig.ignoreDuplicates = document.getElementById('ignoreDuplicatesCheckbox').checked;
        newConfig.youtubeDefaultDescription = document.getElementById('youtubeDefaultDescription').value;
        newConfig.scheduleFrequency = document.getElementById('scheduleFrequency').value;
        newConfig.scheduleDayOfWeek = document.getElementById('scheduleDayOfWeek').value;
        newConfig.scheduleDayOfMonth = document.getElementById('scheduleDayOfMonth').value;
        newConfig.selectedHours = Array.from(document.querySelectorAll('.hour-checkbox')).filter(cb => cb.checked).map(cb => parseInt(cb.value));
        
        newConfig.startWithWindows = startupWinCheckbox.checked;
        newConfig.startAutomatically = startupAutoCheckbox.checked;
        
        newConfig.userEmail = document.getElementById('userEmail').value.trim();

        newConfig.playlistSelection = {};
        themeCheckboxes.forEach(cb => {
            const theme = cb.value;
            const selector = document.getElementById(`playlist-${theme}`);
            if (selector && selector.value) {
                newConfig.playlistSelection[theme] = selector.value;
            }
        });
        
        return newConfig;
    }

    function populateUI(config) {
        currentConfig = config || {};
        Object.keys(pathInputs).forEach(key => { pathInputs[key].value = currentConfig[key] || ''; });
        document.getElementById('geminiApiKey').value = currentConfig.geminiApiKey || '';
        document.getElementById('googleSearchApiKey').value = currentConfig.googleSearchApiKey || '';
        document.getElementById('searchEngineId').value = currentConfig.searchEngineId || '';
        document.getElementById('searchEngineIdFisheries').value = currentConfig.searchEngineIdFisheries || '';
        document.getElementById('youtubeClientId').value = currentConfig.youtubeClientId || '';
        document.getElementById('youtubeClientSecret').value = currentConfig.youtubeClientSecret || '';
        document.getElementById('gcsBucketName').value = currentConfig.gcsBucketName || '';
        
        document.getElementById('stabilityApiKey').value = currentConfig.stabilityApiKey || '';
        document.getElementById('aiImageCount').value = currentConfig.aiImageCount || 3;
        
        addLogoIntroCheckbox.checked = currentConfig.addLogoIntro || false;
        introDurationInput.value = currentConfig.introDuration || 5;
        introAnimationSelect.value = currentConfig.introAnimation || 'slide-in-left';
        addLogoOutroCheckbox.checked = currentConfig.addLogoOutro || false;
        outroDurationInput.value = currentConfig.outroDuration || 5;
        outroAnimationSelect.value = currentConfig.outroAnimation || 'slide-out-right';
        
        addLogoIntroCheckbox.dispatchEvent(new Event('change'));
        addLogoOutroCheckbox.dispatchEvent(new Event('change'));
        
        backgroundOptions.forEach(cb => { cb.disabled = false; });

        useLocalSlideshowCheckbox.checked = currentConfig.useLocalSlideshow || false;
        prioritizeAiCheckbox.checked = currentConfig.prioritizeAiBackground || false;
        randomizeCheckbox.checked = currentConfig.randomizeBackground || false;
        
        if (prioritizeAiCheckbox) {
            prioritizeAiCheckbox.dispatchEvent(new Event('change'));
        }
        
        if (animateAiImagesCheckbox) { // Verifica se o elemento existe (não está comentado)
            animateAiImagesCheckbox.checked = currentConfig.animateAiImages || false;
            motionIntensitySlider.value = currentConfig.motionIntensity || 40;
            animateAiImagesCheckbox.dispatchEvent(new Event('change'));
            motionIntensitySlider.dispatchEvent(new Event('input'));
        }
        
        let oneIsChecked = false;
        backgroundOptions.forEach(cb => {
            if (cb.checked) {
                if (oneIsChecked) { cb.checked = false; } 
                else { oneIsChecked = true; }
            }
        });
        if (oneIsChecked) {
             backgroundOptions.forEach(cb => { if (!cb.checked) cb.disabled = true; });
        }

        batchModeCheckbox.checked = currentConfig.batchMode || false;
        
        if (currentConfig.language === 'en-us') {
            langEnBtn.classList.add('active');
            langPtBtn.classList.remove('active');
        } else {
            langPtBtn.classList.add('active');
            langEnBtn.classList.remove('active');
        }

        const themes = currentConfig.selectedThemes || ['football'];
        themeCheckboxes.forEach(cb => { 
            cb.checked = themes.includes(cb.value);
            cb.dispatchEvent(new Event('change'));
        });
        
        document.getElementById('freeform-prompt-input').value = currentConfig.freeformPrompt || '';
        document.getElementById('freeform-style').value = currentConfig.freeformStyle || 'Documentário / Narrativo';
        document.getElementById('freeform-tone').value = currentConfig.freeformTone || 'Curioso / Educacional';
        document.getElementById('freeform-audience').value = currentConfig.freeformAudience || '';
        
        fixedtextSourceInput.value = currentConfig.fixedtextPath || '';
        fixedtextOriginalCheckbox.checked = currentConfig.fixedtextUseOriginal || false;
        fixedtextLiteralCheckbox.checked = currentConfig.fixedtextUseLiteral || false;
        fixedtextOriginalCheckbox.dispatchEvent(new Event('change'));

        document.getElementById('audioDuration').value = currentConfig.audioDuration || 5;
        
        const langCode = (currentConfig.language || 'pt-br').startsWith('en') ? 'en' : 'pt';
        if (currentConfig.youtubeChannelName) {
            document.getElementById('youtubeStatus').textContent = translations.youtubeStatusConnected[langCode].replace('{channelName}', currentConfig.youtubeChannelName);
        } else {
            document.getElementById('youtubeStatus').textContent = translations.youtubeStatusNotConnected[langCode];
        }

        if (currentConfig.youtubeRefreshToken) {
            logArea.textContent += 'Logado no YouTube. Buscando playlists...\n';
            window.electronAPI.getYoutubePlaylists(currentConfig);
        }

        updateYoutubeButtonStates(!!currentConfig.youtubeRefreshToken);

        document.getElementById('youtubeDefaultDescription').value = currentConfig.youtubeDefaultDescription || '';
        document.getElementById('uploadToYouTubeCheckbox').checked = currentConfig.uploadToYouTube !== false;
        document.getElementById('deleteAfterUploadCheckbox').checked = currentConfig.deleteAfterUpload === true;
        document.getElementById('includeTitleOnThumbnailCheckbox').checked = currentConfig.includeTitleOnThumbnail !== false;
        document.getElementById('ignoreDuplicatesCheckbox').checked = currentConfig.ignoreDuplicates || false;
        document.getElementById('uploadToYouTubeCheckbox').dispatchEvent(new Event('change'));
        document.getElementById('scheduleFrequency').value = currentConfig.scheduleFrequency || 'daily';
        document.getElementById('scheduleDayOfWeek').value = currentConfig.scheduleDayOfWeek || '1';
        document.getElementById('scheduleDayOfMonth').value = currentConfig.scheduleDayOfMonth || '1';
        const selectedHours = currentConfig.selectedHours || [];
        document.querySelectorAll('.hour-checkbox').forEach(cb => { cb.checked = selectedHours.includes(parseInt(cb.value)); });
        document.getElementById('scheduleFrequency').dispatchEvent(new Event('change'));

        startupWinCheckbox.checked = currentConfig.startWithWindows || false;
        startupAutoCheckbox.checked = currentConfig.startAutomatically || false;
        
        document.getElementById('userEmail').value = currentConfig.userEmail || '';
        
        document.querySelectorAll('.playlist-selector').forEach(selector => {
            selector.innerHTML = '';
            selector.style.display = 'none';
        });
        
        setLanguage(currentConfig.language || 'pt-br');
    }
    
    function updatePlaylistSelectors(playlists) {
        const selectors = document.querySelectorAll('.playlist-selector');
        
        if (!playlists || playlists.length === 0) {
            selectors.forEach(selector => selector.style.display = 'none');
            return;
        }
    
        selectors.forEach(selector => {
            const currentTheme = selector.id.replace('playlist-', '');
            const savedSelection = currentConfig.playlistSelection?.[currentTheme];
            
            selector.innerHTML = '';
            
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = (currentConfig.language === 'en-us') ? 'None' : 'Nenhuma';
            selector.appendChild(defaultOption);
    
            playlists.forEach(playlist => {
                const option = document.createElement('option');
                option.value = playlist.id;
                option.textContent = playlist.title;
                selector.appendChild(option);
            });
    
            if (savedSelection) {
                selector.value = savedSelection;
            }
    
            selector.style.display = 'inline-block';
        });
    }
    
    async function initializeDefaultPaths() {
        const userDataPath = await window.electronAPI.getUserDataPath();
        const defaultMediaPaths = {
            musicasPath: `${userDataPath}/musicas`,
            introPath: `${userDataPath}/introducoes`,
            backgroundsPath: `${userDataPath}/fundos`,
        };

        let pathsWereSet = false;
        Object.keys(defaultMediaPaths).forEach(key => {
            if (pathInputs[key] && !pathInputs[key].value) {
                pathInputs[key].value = defaultMediaPaths[key];
                pathsWereSet = true;
            }
        });
        updateLastSavedState();
    }
    
    function generateCronString() {
        const minute = '0';
        const selectedHours = Array.from(document.querySelectorAll('.hour-checkbox')).filter(cb => cb.checked).map(cb => cb.value);
        if (selectedHours.length === 0) return '';
        const hour = selectedHours.join(',');
        let dayOfMonth = '*', month = '*', dayOfWeek = '*';
        const scheduleFrequency = document.getElementById('scheduleFrequency').value;
        if (scheduleFrequency === 'weekly') dayOfWeek = document.getElementById('scheduleDayOfWeek').value;
        else if (scheduleFrequency === 'monthly') dayOfMonth = document.getElementById('scheduleDayOfMonth').value;
        return `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`;
    }

    function updateLastSavedState() {
        const config = collectUIConfig();
        delete config.youtubeRefreshToken;
        delete config.youtubeChannelName;
        lastSavedConfigString = JSON.stringify(config);
        if (isCurrentlyDirty) {
            isCurrentlyDirty = false;
            window.electronAPI.setDirtyState(false);
        }
    }

    function checkForChanges() {
        const currentConfigForCheck = collectUIConfig();
        delete currentConfigForCheck.youtubeRefreshToken;
        delete currentConfigForCheck.youtubeChannelName;
        const currentConfigString = JSON.stringify(currentConfigForCheck);
        const hasChanged = currentConfigString !== lastSavedConfigString;
        if (hasChanged !== isCurrentlyDirty) {
            isCurrentlyDirty = hasChanged;
            window.electronAPI.setDirtyState(isCurrentlyDirty);
        }
    }

    function triggerAutomation() {
        const latestConfig = collectUIConfig();
        if(!latestConfig.outputDir || !latestConfig.geminiApiKey) {
            alert("ERRO: A 'Pasta de Saída' e a 'Chave da API do Gemini' são obrigatórias para iniciar.");
            logArea.scrollTop = logArea.scrollHeight;
            setButtonLoading(startButton, false); 
            return;
        }
        if (latestConfig.selectedThemes.length === 0) {
            alert('ERRO: Por favor, selecione pelo menos um Tipo de Conteúdo.');
            setButtonLoading(startButton, false);
            return;
        }
        
        let themesToRun = [...latestConfig.selectedThemes];
        if (themesToRun.includes('freeform') && !latestConfig.freeformPrompt.trim()) {
            logArea.textContent += "AVISO: 'Prompt Livre' selecionado mas o texto está vazio. Este tema será pulado.\n";
            logArea.scrollTop = logArea.scrollHeight;
            themesToRun = themesToRun.filter(t => t !== 'freeform');
        }
        if (themesToRun.includes('fixedtext') && !latestConfig.fixedtextPath.trim()) {
            logArea.textContent += "AVISO: 'Texto Fixo' selecionado mas nenhuma fonte foi fornecida. Este tema será pulado.\n";
            logArea.scrollTop = logArea.scrollHeight;
            themesToRun = themesToRun.filter(t => t !== 'fixedtext');
        }

        if (themesToRun.length === 0) {
            alert('ERRO: Nenhum tipo de conteúdo válido foi selecionado para ser gerado.');
            setButtonLoading(startButton, false);
            return;
        }
        latestConfig.selectedThemes = themesToRun;

        const finalCronString = generateCronString();
        
        const runData = {
            duration: latestConfig.audioDuration,
            schedule: finalCronString,
            upload: latestConfig.uploadToYouTube,
            delete: latestConfig.deleteAfterUpload,
            config: latestConfig,
        };
        
        window.electronAPI.showStartMenu(runData);
    }
    
    function setupTooltip(triggerElement, text) {
        if (!triggerElement || !text || !tooltipElement) return;

        const moveTooltip = (e) => {
            const offsetX = 15; const offsetY = 15;
            let x = e.clientX + offsetX; let y = e.clientY + offsetY;
            
            if (x + tooltipElement.offsetWidth > window.innerWidth) x = e.clientX - tooltipElement.offsetWidth - offsetX;
            if (y + tooltipElement.offsetHeight > window.innerHeight) y = e.clientY - tooltipElement.offsetHeight - offsetY;

            tooltipElement.style.left = `${x}px`;
            tooltipElement.style.top = `${y}px`;
        };

        triggerElement.addEventListener('mouseenter', (e) => {
            tooltipElement.innerHTML = text; 
            tooltipElement.style.display = 'block';
            moveTooltip(e);
        });

        triggerElement.addEventListener('mouseleave', () => { tooltipElement.style.display = 'none'; });
        triggerElement.addEventListener('mousemove', moveTooltip);
    }
    
    document.querySelectorAll('.tooltip-trigger').forEach(el => {
        const key = el.dataset.tooltipKey;
        const lang = document.documentElement.lang || 'pt';
        if (translations[key] && translations[key][lang]) {
            setupTooltip(el, translations[key][lang]);
        }
    });

    const allConfigInputs = Array.from(document.querySelectorAll('input, select, textarea'));
    allConfigInputs.forEach(input => {
        const eventType = (input.type === 'checkbox' || input.tagName === 'SELECT') ? 'change' : 'input';
        input.addEventListener(eventType, checkForChanges);
    });

    langPtBtn.addEventListener('click', () => {
        if (!langPtBtn.classList.contains('active')) {
            langPtBtn.classList.add('active');
            langEnBtn.classList.remove('active');
            setLanguage('pt-br');
            checkForChanges();
        }
    });

    langEnBtn.addEventListener('click', () => {
        if (!langEnBtn.classList.contains('active')) {
            langEnBtn.classList.add('active');
            langPtBtn.classList.remove('active');
            setLanguage('en-us');
            checkForChanges();
        }
    });

    backgroundOptions.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                backgroundOptions.forEach(otherCheckbox => {
                    if (otherCheckbox !== e.target) {
                        otherCheckbox.checked = false;
                        otherCheckbox.disabled = true;
                    }
                });
            } else {
                backgroundOptions.forEach(cb => { cb.disabled = false; });
            }
        });
    });

    if (prioritizeAiCheckbox) {
        prioritizeAiCheckbox.addEventListener('change', () => {
            const isChecked = prioritizeAiCheckbox.checked;
            if (aiAnimationControls) {
                aiAnimationControls.style.display = isChecked ? 'flex' : 'none';
            }
            if (!isChecked && animateAiImagesCheckbox) {
                animateAiImagesCheckbox.checked = false;
                animateAiImagesCheckbox.dispatchEvent(new Event('change'));
            }
        });
    }

    if (animateAiImagesCheckbox) {
        animateAiImagesCheckbox.addEventListener('change', () => {
            motionIntensitySlider.disabled = !animateAiImagesCheckbox.checked;
        });
        motionIntensitySlider.addEventListener('input', () => {
            motionIntensityValue.textContent = motionIntensitySlider.value;
        });
    }

    addLogoIntroCheckbox.addEventListener('change', (e) => {
        introDurationInput.disabled = !e.target.checked;
        introAnimationSelect.disabled = !e.target.checked;
    });
    addLogoOutroCheckbox.addEventListener('change', (e) => {
        outroDurationInput.disabled = !e.target.checked;
        outroAnimationSelect.disabled = !e.target.checked;
    });

    startupWinCheckbox.addEventListener('change', () => {
        window.electronAPI.setStartupBehavior(startupWinCheckbox.checked);
    });

    function updateThemeOptionPanels() {
        freeformPromptContainer.style.display = freeformCheckbox.checked ? 'flex' : 'none';
        fixedtextContainer.style.display = fixedtextCheckbox.checked ? 'flex' : 'none';
    }

    themeCheckboxes.forEach(cb => {
        cb.addEventListener('change', updateThemeOptionPanels);
    });
    
    fixedtextSelectFileButton.addEventListener('click', async () => {
        const resultPath = await window.electronAPI.selectFile({
            filters: [{ name: 'Arquivos de Mídia e Texto', extensions: ['txt', 'pdf', 'mp3', 'm4a', 'mp4'] }]
        });
        if (resultPath) {
            fixedtextSourceInput.value = resultPath;
            fixedtextSourceInput.dispatchEvent(new Event('input')); 
            checkForChanges();
        }
    });
    
    fixedtextSelectFolderButton.addEventListener('click', async () => {
        const resultPath = await window.electronAPI.selectFolder();
        if (resultPath) {
            fixedtextSourceInput.value = resultPath;
            fixedtextSourceInput.dispatchEvent(new Event('input')); 
            checkForChanges();
        }
    });

    fixedtextSourceInput.addEventListener('input', () => {
        const hasText = fixedtextSourceInput.value.trim().length > 0;
        fixedtextSelectFileButton.disabled = hasText;
        fixedtextSelectFolderButton.disabled = hasText;
        checkForChanges();
    });

    fixedtextOriginalCheckbox.addEventListener('change', () => {
        const isEnabled = fixedtextOriginalCheckbox.checked;
        fixedtextLiteralCheckbox.disabled = !isEnabled;
        if (!isEnabled) {
            fixedtextLiteralCheckbox.checked = false;
        }
        checkForChanges();
    });

    async function initializeApp() {
        const config = await window.electronAPI.loadDefaultConfig();
        if (config) {
            populateUI(config);
            logArea.textContent += 'Configuração padrão carregada.\n';
            window.electronAPI.setStartupBehavior(config.startWithWindows || false);
        }
        await initializeDefaultPaths();
        document.querySelector(".tab-link.active").click();

        if (collectUIConfig().startAutomatically) {
            logArea.textContent += 'Opção "Iniciar Automaticamente" detectada. Tentando iniciar...\n';
            setTimeout(() => {
                setButtonLoading(startButton, true);
                triggerAutomation();
            }, 500);
        }
    }
    
    initializeApp();

    document.getElementById('saveDefaultButton').addEventListener('click', () => {
        const configToSave = collectUIConfig();
        window.electronAPI.saveDefaultConfig(configToSave);
        logArea.textContent += 'Configuração padrão salva.\n';
        updateLastSavedState();
    });

    document.getElementById('saveAsButton').addEventListener('click', async () => {
        const configToSave = collectUIConfig();
        const result = await window.electronAPI.saveConfigFileAs(configToSave);
        if (result && result.filePath) {
            logArea.textContent += `Configuração salva em '${result.filePath}'.\n`;
            updateLastSavedState();
        }
    });

    document.getElementById('openConfigButton').addEventListener('click', async () => {
        const result = await window.electronAPI.openConfigFile();
        if (result && result.config) {
            populateUI(result.config);
            await initializeDefaultPaths();
            logArea.textContent += `Configuração '${result.filePath}' carregada.\n`;
        }
    });
    
    document.getElementById('vinhetaPath-button').addEventListener('click', async () => {
        const resultPath = await window.electronAPI.selectFile({
            filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi'] }]
        });
        if (resultPath) {
            pathInputs.vinhetaPath.value = resultPath;
            checkForChanges();
        }
    });
    document.getElementById('logoPath-button').addEventListener('click', async () => {
        const resultPath = await window.electronAPI.selectFile({
            filters: [{ name: 'Images', extensions: ['png'] }]
        });
        if (resultPath) {
            pathInputs.logoPath.value = resultPath;
            checkForChanges();
        }
    });
    ['musicasPath', 'introPath', 'backgroundsPath', 'outputDir'].forEach(key => {
        const buttonId = `${key}-button`;
        const button = document.getElementById(buttonId);
        if (button) {
            button.addEventListener('click', async () => {
                const resultPath = await window.electronAPI.selectFolder();
                if (resultPath) {
                    pathInputs[key].value = resultPath;
                    checkForChanges();
                }
            });
        }
    });

    startButton.addEventListener('click', () => {
        setButtonLoading(startButton, true);
        triggerAutomation();
    });

    stopButton.addEventListener('click', () => {
        window.electronAPI.showStopMenu();
    });

    document.getElementById('uploadToYouTubeCheckbox').addEventListener('change', (e) => {
        document.getElementById('deleteAfterUploadCheckbox').disabled = !e.target.checked;
        if (!e.target.checked) document.getElementById('deleteAfterUploadCheckbox').checked = false;
    });

    document.getElementById('scheduleFrequency').addEventListener('change', (e) => {
        document.getElementById('weekly-options').style.display = e.target.value === 'weekly' ? 'block' : 'none';
        document.getElementById('monthly-options').style.display = e.target.value === 'monthly' ? 'block' : 'none';
    });
    
    document.getElementById('selectAllHours').addEventListener('click', () => {
        document.querySelectorAll('.hour-checkbox').forEach(cb => cb.checked = true);
        checkForChanges();
    });
    document.getElementById('selectNoneHours').addEventListener('click', () => {
        document.querySelectorAll('.hour-checkbox').forEach(cb => cb.checked = false);
        checkForChanges();
    });
    document.getElementById('selectWorkHours').addEventListener('click', () => {
        document.querySelectorAll('.hour-checkbox').forEach(cb => {
            const hour = parseInt(cb.value);
            cb.checked = (hour >= 9 && hour <= 18);
        });
        checkForChanges();
    });
    document.getElementById('selectNightHours').addEventListener('click', () => {
        document.querySelectorAll('.hour-checkbox').forEach(cb => {
            const hour = parseInt(cb.value);
            cb.checked = (hour >= 0 && hour <= 6);
        });
        checkForChanges();
    });

    helpButton.addEventListener('click', () => { helpModal.style.display = 'block'; });
    closeHelpModal.addEventListener('click', () => { helpModal.style.display = 'none'; });
    window.addEventListener('click', (event) => { if (event.target == helpModal) helpModal.style.display = 'none'; });

    const automationStoppedOrErroredHandler = () => {
        setButtonLoading(startButton, false);
        stopButton.disabled = true;
        fixedtextSourceInput.value = '';
        fixedtextSourceInput.dispatchEvent(new Event('input')); 
    };

    window.electronAPI.onAutomationStarted(() => { 
        setButtonLoading(startButton, true); 
        stopButton.disabled = false; 
    });

    window.electronAPI.onAutomationStopped(automationStoppedOrErroredHandler);
    
    window.electronAPI.onLogUpdate((message) => { 
        if (message.includes('Sequência completa finalizada')) {
            automationStoppedOrErroredHandler();
        }
        logArea.textContent += message + '\n'; 
        logArea.scrollTop = logArea.scrollHeight; 
    });
    window.electronAPI.onVideoComplete(() => { videosGenerated++; document.getElementById('videoCounter').textContent = videosGenerated; });
    window.electronAPI.onAutomationError(() => {
        errorsEncountered++;
        document.getElementById('errorCounter').textContent = errorsEncountered;
        automationStoppedOrErroredHandler();
    });

    window.electronAPI.onInvalidSchedule((schedule) => { 
        alert(`ERRO: Formato de agendamento inválido ou nenhum horário selecionado. A automação não foi agendada.`); 
        automationStoppedOrErroredHandler();
    });
    window.electronAPI.onGetConfig(() => { window.electronAPI.saveDefaultConfig(collectUIConfig()); });

    const splitter = document.getElementById('splitter');
    const topPanels = document.querySelector('.top-panels');
    const container = document.querySelector('.container');
    let isDragging = false;
    splitter.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
    });
    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const containerRect = container.getBoundingClientRect();
        let newTopHeight = e.clientY - containerRect.top;
        if (newTopHeight < 200) newTopHeight = 200;
        if (newTopHeight > container.clientHeight - 150) newTopHeight = container.clientHeight - 150;
        topPanels.style.height = `${newTopHeight}px`;
    });

    youtubeLoginButton.addEventListener('click', () => {
        const clientId = document.getElementById('youtubeClientId').value;
        const clientSecret = document.getElementById('youtubeClientSecret').value;
        if (!clientId || !clientSecret) {
            alert('Por favor, preencha o Client ID e o Client Secret do YouTube primeiro.');
            return;
        }
        updateYoutubeButtonStates(false, true);
        window.electronAPI.youtubeLogin({ clientId, clientSecret });
    });

    youtubeLogoutButton.addEventListener('click', () => {
        youtubeLogoutButton.disabled = true;
        document.querySelectorAll('.playlist-selector').forEach(selector => {
            selector.innerHTML = '';
            selector.style.display = 'none';
        });
        window.electronAPI.youtubeLogout();
    });

    window.electronAPI.onYouTubePlaylistsLoaded((playlists) => {
        updatePlaylistSelectors(playlists);
        checkForChanges(); 
    });

    window.electronAPI.onConfigUpdated((config) => { 
        logArea.textContent += 'Configuração interna do YouTube atualizada.\n'; 
        
        currentConfig.youtubeRefreshToken = config.youtubeRefreshToken;
        currentConfig.youtubeChannelName = config.youtubeChannelName;
        currentConfig.youtubeClientId = config.youtubeClientId;
        currentConfig.youtubeClientSecret = config.youtubeClientSecret;

        const langCode = (currentConfig.language || 'pt-br').startsWith('en') ? 'en' : 'pt';
        if (config.youtubeChannelName) {
            document.getElementById('youtubeStatus').textContent = translations.youtubeStatusConnected[langCode].replace('{channelName}', config.youtubeChannelName);
            if (config.youtubeRefreshToken) {
                window.electronAPI.getYoutubePlaylists(config);
            }
        } else {
            document.getElementById('youtubeStatus').textContent = translations.youtubeStatusNotConnected[langCode];
        }
        
        updateYoutubeButtonStates(!!config.youtubeRefreshToken);
        checkForChanges();
    });
});
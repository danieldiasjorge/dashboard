# Castles Bay · Escritório de Comunicação

Um posto de comando para gerir a comunicação das marcas da Castles Bay.
Corre no browser, sincroniza entre dispositivos e funciona offline como reserva.

## Os espaços

- **Painel** — a vista de abertura: indicadores (próximos 7 dias, por publicar,
  publicados este mês, tarefas), o que **precisa de atenção** (posts e tarefas
  atrasados), a agenda dos próximos 7 dias e a distribuição por categoria.


- **Calendário** — vistas de **Mês / Semana / Dia**. Cada post tem
  **descrição/legenda**, **várias imagens**, data, categoria e estado
  (*Planeado* / *Publicado*). Clica num dia para adicionar; clica num post para
  editar; arrasta um post para o reagendar. Mostra a cor da categoria e um
  contador de imagens (`⧉`).
- **Notas de dia** — marca um dia com uma nota (ex.: "Dia do Pai"), com opção
  de **repetir todos os anos**. Botão **＋ Nota** no calendário.
- **Ideias** — mural para apontar ideias de posts, campanhas e ângulos.
- **Tarefas** — quadro **Kanban** (A fazer / Em curso / Concluído) com
  **prioridade** (alta/média/baixa) e **prazo** (atrasadas e "hoje" em
  destaque). Arrasta os cartões entre colunas ou marca-os concluídos num
  clique; ordenam-se por prioridade e prazo.

## Interação

- **Arrastar** um post para outro dia reagenda-o.
- **Anular** (undo) ao eliminar posts, ideias ou tarefas.
- **Pesquisa** no topo filtra a vista atual; o filtro de **categoria** também.
- **Tema** claro/escuro (escuro por defeito) e memória da última vista.
- **Atalhos**: `1/2/3` mudam de vista · `N` cria · `←/→` muda de mês ·
  `/` foca a pesquisa · `⌘/Ctrl+Enter` guarda · `Esc` fecha.

## Categorias partilhadas

Crias categorias com **nome + cor** (botão `＋` em "Categorias"; o lápis edita
nome e cor). Aparecem nos três espaços e servem de filtro (topo ou barra lateral).

## Sincronização entre dispositivos (Firebase)

Os dados sincronizam via Firestore quando ligas o Firebase:

1. **console.firebase.google.com** → cria projeto.
2. Adiciona uma app **Web** e copia o objeto `firebaseConfig`.
3. Ativa **Firestore Database** e **Authentication → Anónimo**.
4. Regras do Firestore:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /escritorio/{doc} { allow read, write: if request.auth != null; }
       match /escritorio_imagens/{img} { allow read, write: if request.auth != null; }
     }
   }
   ```
5. Na app: botão de estado (canto inferior esquerdo) → colar `firebaseConfig` → **Ligar**.

Para não colares em cada dispositivo, define o `firebaseConfig` no ficheiro
`config.js` (ver `config.example.js`) — passa a funcionar automaticamente.

O texto (categorias, posts, ideias, tarefas) vai num documento único; cada
**imagem** vai num documento próprio (`escritorio_imagens`), para não esbarrar
no limite de 1 MB por documento do Firestore.

## Cópias de segurança

- **Exportar / Importar** — `.json` com tudo (inclui as imagens).

## Publicar

Site estático — publica a pasta no **Vercel** (Add New → Project → importar o
repositório → Deploy) ou noutro alojamento estático.

## Ficheiros

- `index.html` — estrutura
- `fonts.css` — fontes embutidas (Syne + Archivo, SIL OFL)
- `styles.css` — design ("Command Deck": escuro por defeito, tema claro incluído)
- `app.js` — lógica (só o SDK do Firebase como dependência externa, para sync)
- `config.example.js` — modelo para ativar a sincronização automática

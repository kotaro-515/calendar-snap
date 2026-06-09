// ==========================================
// Calendar Snap - Express Backend Server
// ==========================================

import express from 'express';
import session from 'express-session';
import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 環境変数のロード
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェアの設定
app.use(cors());
app.use(express.json({ limit: '10mb' })); // 画像送信用に制限を緩和
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// セッション管理の設定 (メモリセッション)
app.use(session({
  secret: process.env.SESSION_SECRET || 'super_secret_calendar_snap_session_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // 本番HTTPS環境では true に設定
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30日間
  }
}));

// 静的ファイルの提供 (フロントエンド)
app.use(express.static(path.join(__dirname, 'public')));

// Google OAuth2 クライアントを生成するヘルパー関数
function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// 模擬認証モードで動かすかどうかの判定 (環境変数が設定されていない場合にモックにする)
const USE_MOCK_AUTH = !process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID.trim() === '';

// ==========================================
// 1. Google OAuth2 認証・認可エンドポイント
// ==========================================

// 【Step 1】Googleでログイン (プロフィール情報のみ要求)
app.get('/auth/google', (req, res) => {
  if (USE_MOCK_AUTH) {
    return res.redirect('/mock-login.html');
  }

  const oauth2Client = createOAuth2Client();
  
  // ログイン用の最小限のスコープ
  const scopes = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email'
  ];
  
  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // リフレッシュトークンを要求
    scope: scopes,
    prompt: 'consent' // 毎回リフレッシュトークンを確実に取得するため
  });
  
  res.redirect(authorizeUrl);
});

// 【Step 2】カレンダーAPI連携の追加許可
app.get('/auth/grant', (req, res) => {
  if (USE_MOCK_AUTH) {
    return res.redirect('/mock-grant.html');
  }

  if (!req.session.tokens) {
    return res.status(401).send('ログインが完了していません。先にログインを行ってください。');
  }

  const oauth2Client = createOAuth2Client();
  
  // カレンダーの追加認可スコープ (ログイン用スコープも維持)
  const scopes = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/calendar.events' // カレンダー作成権限
  ];
  
  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent', // 確実にリフレッシュトークンとパーミッションの合意を得る
    include_granted_scopes: true // 既存の許可スコープも包含する
  });
  
  res.redirect(authorizeUrl);
});

// Google OAuth コールバックハンドラー
app.get('/auth/google/callback', async (req, res) => {
  const { code, name, email } = req.query;
  if (!code) {
    return res.redirect('/?error=auth_failed');
  }
  
  try {
    if (USE_MOCK_AUTH) {
      // 模擬ログイン・認可の処理
      const mockName = name ? decodeURIComponent(name.toString()) : 'テストユーザー';
      const mockEmail = email ? decodeURIComponent(email.toString()) : 'test@example.com';
      
      const isGrantFlow = code.toString().includes('granted');
      
      req.session.userInfo = {
        name: mockName,
        email: mockEmail,
        picture: 'https://lh3.googleusercontent.com/a/default-user=s96-c'
      };
      
      // 認可画面経由の場合はカレンダー権限付きのスコープを設定
      const scopes = isGrantFlow 
        ? 'openid https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events'
        : 'openid https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';
        
      req.session.tokens = {
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        scope: scopes
      };
      
      return res.redirect('/');
    }

    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code.toString());
    oauth2Client.setCredentials(tokens);
    
    // Googleからユーザープロフィール情報を取得
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfoRes = await oauth2.userinfo.get();
    const userInfo = userInfoRes.data;
    
    // セッションに保存
    req.session.userInfo = userInfo;
    
    // トークンのマージ処理 (カレンダー権限が追加された場合などに対応)
    if (req.session.tokens) {
      req.session.tokens = {
        ...req.session.tokens,
        ...tokens
      };
    } else {
      req.session.tokens = tokens;
    }
    
    // トップページへリダイレクト
    res.redirect('/');
  } catch (error) {
    console.error('OAuth Callback Error:', error);
    res.redirect('/?error=callback_failed');
  }
});

// ログインステータスとユーザー情報を確認
app.get('/auth/status', (req, res) => {
  const isGeminiConfigured = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '';
  
  // ハイブリッドモードではAI画像解析用にGEMINI_API_KEYさえ設定されていれば稼働する
  if (!isGeminiConfigured) {
    return res.json({
      configured: false,
      isAuthenticated: false,
      isCalendarGranted: false
    });
  }

  if (req.session.tokens && req.session.userInfo) {
    // カレンダーの権限（スコープ）が含まれているか確認
    const scopes = req.session.tokens.scope || '';
    const isCalendarGranted = scopes.includes('calendar.events');
    
    res.json({
      configured: true,
      isAuthenticated: true,
      isCalendarGranted: isCalendarGranted,
      isMockAuth: USE_MOCK_AUTH,
      user: {
        name: req.session.userInfo.name,
        picture: req.session.userInfo.picture,
        email: req.session.userInfo.email
      }
    });
  } else {
    res.json({
      configured: true,
      isAuthenticated: false,
      isCalendarGranted: false,
      isMockAuth: USE_MOCK_AUTH
    });
  }
});

// ログアウト処理
app.get('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
    }
    res.redirect('/');
  });
});

// ==========================================
// 2. Gemini AI による画像解析 API プロキシ
// ==========================================
app.post('/api/analyze', async (req, res) => {
  // セッションと設定のチェック
  if (!req.session.tokens) {
    return res.status(401).json({ error: '認証が必要です。ログインしてください。' });
  }
  
  const { image, mimeType } = req.body;
  if (!image || !mimeType) {
    return res.status(400).json({ error: '画像データとMIMEタイプが必要です。' });
  }
  
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'サーバーのGemini APIキーが設定されていません。' });
  }
  
  try {
    // Gemini APIクライアントの初期化
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-pro' });

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    const systemPrompt = `あなたはカレンダー予定抽出の専門AIです。
画像（チラシ・スケジュール表・メモ・スクリーンショット・手書きメモ等）から予定情報を正確に読み取り、JSONで返してください。
今日の日付は${currentYear}年${currentMonth}月${currentDay}日です。

## 抽出ルール（厳守）

### summary（タイトル）
- 予定・イベントの正式名称を抽出する
- 略称より正式名称を優先する
- 例：「〇〇セミナー」「△△会議」「歯科検診」

### location（場所）
- 建物名・住所・会議室名・ZoomリンクURL等を抽出する
- 「オンライン」「Zoom」「Google Meet」等も記録する
- 情報がない場合は空文字 ""

### description（説明）
- 参加費・定員・持ち物・注意事項・申込先・登壇者・アジェンダなど
- 画像内の補足テキストを要約して記載する
- 情報がない場合は空文字 ""

### startDate / endDate（日付）
- 必ずYYYY-MM-DD形式
- 「3月15日」のように年がない → 今年 ${currentYear} 年として補完
- 「来月」「今週土曜」等の相対表現 → 今日(${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(currentDay).padStart(2,'0')})基準で計算して絶対日付に変換
- 終了日の記載がない → 開始日と同じ日

### startTime / endTime（時刻）
- 必ずHH:MM形式（24時間制）
- 「午後2時」→「14:00」、「2pm」→「14:00」のように変換
- 「10:00〜」のように終了時刻がない → 開始の1〜2時間後を推定
- 時刻の記載が全くない → 開始「09:00」、終了「10:00」

## 出力形式
マークダウンやコードブロックを一切含めず、以下の純粋なJSONのみを返す：

{
  "summary": "予定のタイトル",
  "location": "場所",
  "description": "説明文",
  "startDate": "YYYY-MM-DD",
  "startTime": "HH:MM",
  "endDate": "YYYY-MM-DD",
  "endTime": "HH:MM"
}`;

    // Geminiへリクエスト送信
    const response = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: image
              }
            },
            {
              text: systemPrompt
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1
      }
    });
    
    const jsonText = response.text();
    const parsedData = JSON.parse(jsonText.trim());
    
    res.json(parsedData);
  } catch (error) {
    console.error('Gemini Analysis Server Error:', error);
    res.status(500).json({ error: 'AIによる予定の解析に失敗しました。画像が鮮明であることを確認してください。' });
  }
});

// ==========================================
// 3. Google カレンダー予定追加 API プロキシ
// ==========================================
app.post('/api/calendar/add', async (req, res) => {
  if (!req.session.tokens) {
    return res.status(401).json({ error: 'Google認証が完了していません。' });
  }
  
  const scopes = req.session.tokens.scope || '';
  if (!scopes.includes('calendar.events')) {
    return res.status(403).json({ error: 'カレンダーへのAPI連携許可（抜き取り許可）が必要です。' });
  }
  
  const { summary, location, description, startDate, startTime, endDate, endTime } = req.body;
  if (!summary || !startDate || !startTime || !endDate || !endTime) {
    return res.status(400).json({ error: '必須項目（タイトル、日時）が不足しています。' });
  }
  
  if (USE_MOCK_AUTH) {
    return res.json({
      summary,
      location,
      description,
      htmlLink: 'https://calendar.google.com/'
    });
  }

  try {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials(req.session.tokens);
    
    // トークンがリフレッシュ（自動更新）されたときにセッションに保存するリスナーを設定
    oauth2Client.on('tokens', (newTokens) => {
      req.session.tokens = {
        ...req.session.tokens,
        ...newTokens
      };
      req.session.save(); // セッション変更を即座に確定
    });
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const startDt = `${startDate}T${startTime}:00`;
    const endDt = `${endDate}T${endTime}:00`;
    
    const event = {
      summary,
      location,
      description,
      start: {
        dateTime: startDt,
        timeZone: 'Asia/Tokyo'
      },
      end: {
        dateTime: endDt,
        timeZone: 'Asia/Tokyo'
      }
    };
    
    const insertRes = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event
    });
    
    res.json(insertRes.data);
  } catch (error) {
    console.error('Google Calendar Add Server Error:', error);
    res.status(500).json({ error: error.message || 'カレンダーへの予定登録に失敗しました。' });
  }
});

// その他のルートはフロントエンドにリダイレクト
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// サーバー起動
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(` Calendar Snap サーバー起動完了！                  `);
    console.log(` URL: http://localhost:${PORT}                      `);
    console.log(`===================================================`);
  });
}

export default app;

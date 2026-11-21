# Data Model: 老師登入

本文件與 [`diagrams/002-class.puml`](../../diagrams/002-class.puml) 一一對應：類別名稱、欄位、方法與關聯相同。型別位置見 [plan.md](./plan.md)「藍圖對照」。

## 1. 001 的實體（`shared/src/entities.ts`，不改欄位）

| 實體 | 欄位 | 002 的用法 |
| --- | --- | --- |
| `TeacherAccount` | `name: string`、`email: string` | `email` 取 id_token 的 `email`；`name` 取 `email` 的 `@` 前面部分（research RD-03） |
| `SignInFailure`（enum） | `CANCELLED`、`NOT_TEACHER`、`SCOPE_DENIED` | `SCOPE_DENIED` 為 002 新增，**需請 001 修改**（spec「需請 001 修改」第 1 條）；001 合併前不得加入 |
| `SignInResult` | `ok: boolean`、`account?: TeacherAccount`、`failure?: SignInFailure` | `HttpAuthService.signInWithGoogle()` 的回傳值；`ok` 為 true 時必有 `account`，false 時必有 `failure` |
| `UnexpectedError` | `message: string` | 非預期錯誤以它 reject；`ApiError` 符合這個形狀 |

## 2. 前端（`frontend/src/services/http/`）

| 類別 | 欄位／方法 | 規則 |
| --- | --- | --- |
| `HttpAuthService`（實作 001 `AuthService`） | `signInWithGoogle(): Promise<SignInResult>`、`getCurrentAccount(): Promise<TeacherAccount \| null>`；私有 `signingIn` | 登入進行中再呼叫回傳同一個 Promise；結果對應見 [contracts/auth-http.md](./contracts/auth-http.md)「前端如何轉換」 |
| `GoogleIdentityClient`（介面） | `requestCode(clientId: string, scopes: string[]): Promise<GoogleCodeResult>` | 唯一實作 `GisGoogleIdentityClient`；介面供測試替身使用（原則 VIII） |
| `GisGoogleIdentityClient` | — | 載入 GIS、以 popup 取得授權碼（research RD-10） |
| `GoogleCodeResult` | `code?: string`、`error?: GoogleCodeError` | 兩者恰有一個 |
| `GoogleCodeError`（enum） | `CANCELLED`、`POPUP_BLOCKED`、`LOAD_FAILED` | `CANCELLED` 包含關閉視窗與 `access_denied` |
| `TeacherCredentialStore` | `get(): string \| null`、`set(token: string): void`、`clear(): void` | 只存在 `sessionStorage` 的 `teacherToken`；不得使用 `localStorage` 或 cookie（REQ-AUTH-06） |
| `ApiClient` | `request<T>(method: string, path: string, body?: unknown): Promise<T>` | 有憑證就帶 `Authorization: Bearer`；錯誤以 `ApiError` reject（research RD-10） |
| `ApiError`（符合 `UnexpectedError`） | `status: number`、`code: string`、`message: string` | `status = 0`、`code = 'NETWORK'` 表示連不上伺服器 |

## 3. 伺服器（`server/src/`）

| 類別 | 欄位／方法 | 規則 |
| --- | --- | --- |
| `AppConfig` | `port: number`、`google: GoogleConfig \| null`、`missingGoogleVars: string[]` | `loadConfig(env)` 產生；`port` 取 `PORT`，預設 3000，必須是 1–65535 的整數，否則啟動失敗並說明 |
| `GoogleConfig` | `clientId`、`clientSecret`、`apiKey`、`appId`（皆 `string`） | 四個環境變數都非空白才建立；只存在記憶體，不得 log |
| `TeacherAuth` | `signIn(code: string): Promise<SignInOutcome>`、`verify(token: string): boolean`、`currentAccount(): TeacherAccount \| null`、`onRotate(listener: () => void): void`；私有 `binding: TeacherBinding \| null` | 見下方「老師綁定的狀態轉換」 |
| `TeacherBinding` | `googleSub: string`、`account: TeacherAccount`、`teacherToken: string` | 同一時間最多一份；`teacherToken` 為 32 bytes 隨機值的 base64url（43 字元） |
| `SignInOutcome` | `ok: boolean`、`teacherToken?: string`、`account?: TeacherAccount`、`failure?: SignInFailure` | `failure` 只會是 `NOT_TEACHER` 或 `SCOPE_DENIED`（`CANCELLED` 只發生在前端） |
| `GoogleOAuthGateway`（介面） | `exchangeCode(code: string): Promise<GoogleSignIn>`、`createClient(tokens: GoogleTokens): OAuth2Client` | 唯一實作 `GoogleAuthLibraryGateway`；介面供測試替身使用 |
| `GoogleAuthLibraryGateway` | — | 交換授權碼（`redirect_uri = 'postmessage'`）、驗證 id_token（`audience = clientId`）；15 秒逾時 |
| `GoogleSignIn` | `sub: string`、`email: string`、`grantedScopes: string[]`、`tokens: GoogleTokens` | `grantedScopes` 由交換回應的 `scope` 以空白切開 |
| `GoogleTokens` | `accessToken: string`、`refreshToken: string`、`expiryDate: number` | Google 沒有回傳 `refreshToken` 時視為 `GoogleUnavailableError`（每次登入都要求同意畫面，正常情況一定有） |
| `GoogleClientProvider` | `replace(tokens: GoogleTokens): void`、`authorizedClient(): OAuth2Client`；私有 `client: OAuth2Client \| null` | 沒有 `client` 時 `authorizedClient()` 丟 `TeacherNotSignedInError` |
| `TeacherNotSignedInError` | `code = 'NOT_SIGNED_IN'` | 003、006 轉成「老師登入已失效，請回首頁重新登入」 |
| `GoogleUnavailableError` | `code = 'GOOGLE_UNAVAILABLE'` | 逾時或網路錯誤 |
| `isGoogleAuthExpired(error)` | `(error: unknown) => boolean` | `invalid_grant` 或 Google 回 401 時為 true |
| `PickerToken` | `accessToken`、`apiKey`、`appId`（皆 `string`） | `GET /api/auth/picker-token` 的回應 |
| `ErrorBody` | `code: string`、`message: string` | 所有錯誤回應的格式；`message` 是給老師看的中文 |
| `requireTeacher` | `(request, reply) => Promise<void>` | Fastify preHandler；以 `app.requireTeacher` 提供 |
| `authRoutes` | Fastify plugin | 四個路由，見 [contracts/auth-http.md](./contracts/auth-http.md) |
| `attachSocketServer` | `(app, teacherAuth) => io.Server`；常數 `TEACHER_ROOM = 'teacher'` | 見 [contracts/socket-handshake.md](./contracts/socket-handshake.md) |
| `buildApp` | `(config: AppConfig, deps) => FastifyInstance` | 伺服器組合根；`deps` 為 `{ gateway: GoogleOAuthGateway }`，測試時注入替身 |

## 4. 老師綁定的狀態轉換（`TeacherAuth`）

```text
（伺服器啟動）
NO_TEACHER
  --signIn：缺少 drive.file--> NO_TEACHER（SCOPE_DENIED）
  --signIn：取得 sub=A--> BOUND(A, token1)

BOUND(A, tokenN)
  --signIn：缺少 drive.file（不論帳號）--> BOUND(A, tokenN)（SCOPE_DENIED）
  --signIn：sub≠A--> BOUND(A, tokenN)（NOT_TEACHER，丟棄授權）
  --signIn：sub=A--> BOUND(A, tokenN+1)（tokenN 作廢；replace(tokens)；onRotate）

（伺服器重新啟動）→ NO_TEACHER
```

- `verify(token)`：只有 `BOUND` 且 `token` 等於目前的 `teacherToken` 時為 true（`timingSafeEqual`）。
- `exchangeCode` 之後到綁定完成之間沒有 `await`，兩個同時進行的 `signIn` 只有一個能從 `NO_TEACHER` 綁定（AC-05）。
- 老師綁定只影響老師身分與 Google 授權，**不碰**活動狀態（REQ-AUTH-03；活動屬於 004）。

## 5. 前端老師憑證的生命週期

```text
（分頁開啟）沒有憑證
  --signInWithGoogle 成功--> 有憑證（sessionStorage）
有憑證
  --重新整理--> 有憑證（不變）
  --同分頁再登入成功--> 有新的憑證
  --請求回 401--> 沒有憑證（ApiClient 清除）
  --分頁關閉--> 消失
```

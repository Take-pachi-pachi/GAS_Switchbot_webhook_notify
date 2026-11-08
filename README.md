# SwitchBot Webhook 受信 GAS

このガイドでは [switchbot_webhook_receiver.gs](./switchbot_webhook_receiver.gs) を Google Apps Script (GAS) に登録し、SwitchBot Webhook をスプレッドシートへ保存する方法と、指定したデバイスの特定状態だけをメール通知する方法を説明します。

## 概要
- Switchbot API v1.1に準拠したWebhookレシーバーです
- 受信したWebhook文字列を、
   - ①指定したGoogleスプレッドシートにLogとして記載、
   - ②設定した条件を満たしたものは指定アドレスにメール送信 します
- 本コードでは、玄関扉に取り付けた
   -    開閉センサーがOpenを検出した時
   -    ロックが Lockになった時
に指定メールアドレスに通知メールを送信します。複数メールアドレスを設定できるので家族と状況を共有できます。
家の鍵をちゃんと掛けたか不安、子供に家の鍵を渡していて帰宅したかを知りたい、時などに便利です

## できること

- SwitchBot から届く POST Webhook の本文を文字列のまま保存
- 受信のたびに、`WebhookLog` シートの最終行の次へA列に受信日時、B列に受信本文を追記
- 指定したデバイス MAC と Status 項目・値が一致した場合だけメール送信
- メール本文は空で、件名にデバイス名と一致した Status を記載
- ロックで同時書き込みによる行の競合を抑止
- シートが存在しない場合は自動作成

メールの対象条件は、GAS ファイル先頭の `CONFIG` で設定します。

## 1. Google スプレッドシートを準備

1. 保存先にしたい Google スプレッドシートを作成または開きます。
2. ブラウザーの URL からスプレッドシート ID をコピーします。

   URL は通常、次の形式です。

   ```text
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
   ```

   `/d/` と `/edit` の間がスプレッドシート ID です。
3. シート名は初期値では `WebhookLog` です。シートがなければ受信時に自動作成します。

## 2. 通知条件に使う値を決める

SwitchBot の Webhook イベントは、機器によって `context` 内の項目が異なります。たとえば Lock のイベントは、概ね次の形です。

```json
{
  "eventType": "changeReport",
  "eventVersion": "1",
  "context": {
    "deviceType": "WoLock",
    "deviceMac": "AA:BB:CC:DD:EE:FF",
    "lockState": "UNLOCKED",
    "battery": 100,
    "timeOfSample": 123456789
  }
}
```

この例の識別子と状態は以下です。

- デバイス識別子: `context.deviceMac`
- 状態項目: `context.lockState`
- 状態値: `LOCKED` または `UNLOCKED`

Webhook のデバイス識別子は `context.deviceMac` です。API のデバイス一覧にある `deviceId` と値が同じ形式とは限らないため、実際に受け取ったイベントの `deviceMac` と照合してください。

## 3. GAS プロジェクトを作成してコードを設定

1. [Google Apps Script](https://script.google.com/) を開き、新しいプロジェクトを作成します。
2. エディターの初期コードを削除します。
3. [switchbot_webhook_receiver.gs](./switchbot_webhook_receiver.gs) の内容をコピーして貼り付けます。
4. ファイル上部の `CONFIG` はシート名や通知条件の項目名など、秘密ではない設定だけを記述します。スプレッドシートID、メールアドレス、デバイスMACはコードに書かず、次の「スクリプト プロパティ」に登録します。

```javascript
const CONFIG = {
  sheetName: 'WebhookLog',
  notificationRules: [
    {
      deviceName: '玄関開閉センサー',
      deviceMacProperty: 'CONTACT_SENSOR_MAC',
      statusField: 'openState',
      statusValue: 'open',
    },
    {
      deviceName: '玄関ロック',
      deviceMacProperty: 'LOCK_28_MAC',
      statusField: 'lockState',
      statusValue: 'LOCKED',
    },
  ],
};
```

各設定項目:

| 項目 | 説明 | 例 |
|---|---|---|
| `sheetName` | 受信データを書き込むシート名 | `WebhookLog` |
| `notificationRules` | メール通知条件の配列。各ルールはデバイスとStatusの組み合わせ | センサー開 / ロック施錠 |
| `deviceName` | メール件名に表示するデバイス名 | `玄関ロック` |
| `deviceMacProperty` | MACを保管したスクリプト プロパティのキー名 | `LOCK_28_MAC` |
| `statusField` | `context` 内の Status 項目名 | `lockState` |
| `statusValue` | 通知する Status 値 | `LOCKED` |

### スクリプト プロパティを設定

1. GAS エディター左側の **プロジェクトの設定**（歯車アイコン）を開きます。
2. **スクリプト プロパティ**までスクロールし、**スクリプト プロパティを追加**を選びます。
3. 以下の4項目をキーと値のペアで登録します。値は各自の環境に合わせ、チャットやソースコードには貼り付けないでください。

| プロパティ名（キー） | 値 |
|---|---|
| `SPREADSHEET_ID` | 保存先スプレッドシートURLの `/d/` と `/edit` の間のID |
| `NOTIFICATION_EMAIL` | 通知先メールアドレス |
| `CONTACT_SENSOR_MAC` | 玄関開閉センサーの Webhook `context.deviceMac` |
| `LOCK_28_MAC` | ロック 28 の Webhook `context.deviceMac` |

通知先を複数にする場合は、`NOTIFICATION_EMAIL` の値にメールアドレスをカンマ区切りで設定します。

```text
alice@example.com,bob@example.com
```

この値はスクリプト プロパティにのみ設定し、Readme やソースコードには実際のメールアドレスを書かないでください。

現在の `deviceList.json` にある Device ID と同じ値を初期値として使えますが、Webhook 仕様上の照合値は `context.deviceMac` です。最初の受信後にシートへ記録された値と比較してください。異なる場合はプロパティの値をイベントの `context.deviceMac` に合わせて変更します。実際の MAC 値はソースコードや Readme に記載せず、スクリプト プロパティにだけ保存してください。

スクリプト プロパティはソースコードに値を埋め込まないための保管場所ですが、GAS プロジェクトの編集者はプロジェクト設定やスクリプト実行を通じて値を扱える可能性があります。信頼できるユーザーだけを編集者にしてください。

Webhook 受信処理は SwitchBot API を呼び出さないため、SwitchBot の Open Token / Secret Key はこの GAS には不要です。Webhook URL の登録を行う Python ツール用の認証情報は、引き続きプロジェクトの `.env` に保管し、公開しないでください。

デバイス識別子の比較では大文字・小文字と `:` / `-` を無視します。Status 値も大文字・小文字を無視しますが、Status 項目名は `context` 内の正確なキー名を指定してください。以下の2条件は [deviceList.json](./deviceList.json) のIDと SwitchBot API リポジトリのイベント仕様をもとに設定しています。初回受信後、シートの `context.deviceMac` が登録値と一致していることを確認してください。

### 今回設定した通知条件

| デバイス | MAC の保存先プロパティ | Status 項目 | 通知する値 |
|---|---|---|---|
| 玄関開閉センサー | `CONTACT_SENSOR_MAC` | `openState` | `open` |
| 玄関ロック | `LOCK_28_MAC` | `lockState` | `LOCKED` |

いずれか一方の条件に一致した場合、`NOTIFICATION_EMAIL` に設定した宛先へメールを送信します。件名は「デバイス名 + Status 値」（例: `玄関ロック LOCKED`）で、メール本文は空です。Webhook 本文はメールに含めず、スプレッドシートのB列で確認します。センサーが `close` になったときや、ロックが `UNLOCKED` になったときはメールを送信しません。

### 通知条件を追加・変更する例

Bot の `power` が `on` のとき:

```javascript
{
  deviceName: '照明',
  deviceMacProperty: 'LIGHT_MAC',
  statusField: 'power',
  statusValue: 'on',
},
```

`LIGHT_MAC` はスクリプト プロパティに追加し、その値に対象機器の `context.deviceMac` を設定します。機器・イベントによってキー名や値の表記は異なるため、保存されたイベント本文を確認して `notificationRules` にルールを追加してください。

## 4. ウェブアプリとしてデプロイ

1. GAS エディター右上の **デプロイ** → **新しいデプロイ** を選択します。
2. 種類の選択（歯車アイコン）から **ウェブアプリ** を選びます。
3. 次のように設定します。
   - **次のユーザーとして実行**: 自分
   - **アクセスできるユーザー**: 全員
4. **デプロイ** を押します。
5. 初回は Google の権限確認が表示されます。スプレッドシートへの書き込みとメール送信に必要な権限を確認し、許可します。
6. 表示されたウェブアプリ URL をコピーします。

SwitchBot から外部アクセスできるようにするため、Webhook の宛先はデプロイで発行された `/exec` URL を使用します。テスト用 `/dev` URL ではなく、デプロイ済みの URL を設定してください。

コードや `CONFIG` を変更した場合は、**デプロイを管理**から新しいバージョンをデプロイしてください。

## 5. SwitchBot に Webhook URL を登録

取得したウェブアプリ URL を SwitchBot の Webhook 宛先として登録します。既存の [webhook_Switchbot.py](./webhook_Switchbot.py) を使う場合、プロジェクトの仮想環境から次のように実行できます。

```powershell
.\.venv\Scripts\python.exe .\webhook_Switchbot.py setup-webhook --url "GASで発行したウェブアプリURL"
```

登録済み URL の確認:

```powershell
.\.venv\Scripts\python.exe .\webhook_Switchbot.py query-webhook
```

この Python スクリプトを使う場合は、プロジェクトの `.env` に `SWITCHBOT_TOKEN` と `SWITCHBOT_SECRET` が設定されている必要があります。

## 6. 受信内容の確認

Webhook が届くと、`WebhookLog` シートの最終行の次に1行ずつ追加されます。

| 列 | 内容 |
|---|---|
| A列 | GAS が Webhook を受信した日時 |
| B列 | 受信した本文の文字列（JSON は1セルにそのまま保存） |

行1が見出しや既存データの場合は、その次の行から追記されます。

メールは、次のいずれかの通知ルールで両方の条件が一致した場合だけ送信されます。

1. `context.deviceMac` がルールの `deviceMac` と一致
2. `context[statusField]` がルールの `statusValue` と一致

現在は「玄関開閉センサーの `openState=open`」または「玄関ロックの `lockState=LOCKED`」が対象です。メール件名にルールのデバイス名と Status 値が入り、メール本文は空です。Webhook 本文は先にシートのB列へ保存します。

## 7. トラブルシューティング

### スプレッドシートに行が追加されない

- `SPREADSHEET_ID` がスクリプト プロパティに登録されているか確認します。
- GAS を実行するユーザーに対象シートへのアクセス権があるか確認します。
- デプロイ設定が **次のユーザーとして実行: 自分** になっているか確認します。
- GAS の **実行数** で失敗ログを確認します。
- コードを変更した場合、新しいデプロイバージョンを発行したか確認します。

### メールが届かない

- `NOTIFICATION_EMAIL` がスクリプト プロパティに登録されているか確認します。
- `CONTACT_SENSOR_MAC` / `LOCK_28_MAC` がスクリプト プロパティに登録されているか確認します。
- シートに保存された JSON の `context.deviceMac`、Status 項目名、値を確認します。
- いずれかの `notificationRules` のデバイス識別子と Status 条件がイベントに一致するか確認します。識別子は大文字・小文字と `:` / `-`、値は大文字・小文字を無視します。Status の項目名は正確に一致する必要があります。
- GAS の実行ログで MailApp の権限や送信エラーを確認します。

### Webhook の送信元でエラーになる

- SwitchBot に登録した URL が現在のデプロイ URL と一致するか確認します。
- ウェブアプリのアクセス設定が **全員** になっているか確認します。
- GAS の実行数で `doPost` のエラーを確認します。

### 初回認証

Webhook は外部から `doPost` を呼び出すため、エディターの **実行** ボタンで `doPost` を直接テストするのではなく、ウェブアプリへの POST で確認してください。必要な権限を承認する画面が表示された場合は、デプロイ所有者のアカウントで許可します。

## 8. セキュリティと運用上の注意

- ウェブアプリを「全員」に公開すると、URLを知る第三者もリクエストを送れる可能性があります。Webhook URL は公開しないでください。
- このスクリプトは受信 JSON をそのまま記録します。記録されるデータに応じて、スプレッドシートの共有範囲を制限してください。
- 現在の実装は SwitchBot からのリクエスト署名検証をしていません。Webhook URL を秘密として扱い、必要に応じて追加の認証・検証方法を設計してください。
- メール送信は Google アカウントの送信上限や GAS のクォータに従います。
- 同一イベントが複数回届いた場合の重複排除は行いません。受信ごとに1行追加し、条件に一致するごとにメールを送ります。
- A列には JavaScript の `Date` 値として受信日時を記録します。シート上で日付だけに見える場合は、A列の表示形式を `yyyy/MM/dd HH:mm:ss` など日時を含む形式に変更してください。

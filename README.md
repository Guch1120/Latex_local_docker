# Web LaTeX Editor

Dockerを使用して動作する、Cloud LaTeX風のWebベースLaTeXエディタ
ファイルの編集、アップロード、画像の挿入、PDFのコンパイルとプレビューが可能

## 必要条件

*   Docker
*   Docker Compose

## セットアップと起動方法

1.  gitをクローンする
    ```bash
    git clone https://github.com/Guch1120/Latex_local_docker.git
    ```
2.  gitブランチを作成する．ここ大事．これしないとgitで管理されるのが人のと混ざってしまう．
    ブランチ名はお好きに．
    ```bash
    git checkout -b  好きなブランチ名
    ```
3.  以下のコマンドを実行してコンテナをビルド・起動
    ```bash
    docker compose up -d --build
    ```

4.  ブラウザで [http://localhost:8000](http://localhost:8000) にアクセス
## 使い方

### 画面構成
*   **左側**: ファイルエクスプローラー。作業ディレクトリ内のファイル一覧が表示
    *   システムファイル（`Dockerfile`など）は非表示
    *   `+` ボタンで任意のファイルをアップロード
*   **中央**: エディタ。LaTeXファイルの編集を行います。
    *   `Save (Ctrl+S)`: ファイルを保存
    *   `Insert Image`: 画像をアップロードし、カーソル位置に `\includegraphics` コマンドを挿入
    *   `Compile`: `latexmk` を実行してPDFを生成
    *   `log`: コンパイルログを表示.エラーがあればここに表示される
*   **右側**: PDFプレビュー。コンパイル成功時に自動的に更新される

### 注意事項
*   編集内容はコンテナ内のボリュームに保存されます。ここのファイル群は全部まるっとホストとつなげてる
*   ポート8000番を使用します。変更したい場合は `docker-compose.yml` を編集してください

## 停止方法

```bash
docker compose down
```

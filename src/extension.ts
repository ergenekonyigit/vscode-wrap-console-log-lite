'use strict';

import * as vscode from 'vscode';

let currentEditor: vscode.TextEditor;

export function activate(context: vscode.ExtensionContext) {
  currentEditor = vscode.window.activeTextEditor;
  vscode.window.onDidChangeActiveTextEditor(editor => currentEditor = editor);
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand('console.log.wrap', () => handle(false)),
    vscode.commands.registerTextEditorCommand('console.log.wrap.prefix', () => handle(true, FormatAs.String)),
    vscode.commands.registerTextEditorCommand('console.log.wrap.object', () => handle(false, FormatAs.Object)),
  );
}

function handle(prefix?: boolean, formatAs?: FormatAs) {
  new Promise((resolve, reject) => {
    let sel = currentEditor.selection;
    let len = sel.end.character - sel.start.character;

    let ran = len == 0 ? currentEditor.document.getWordRangeAtPosition(sel.anchor) :
      new vscode.Range(sel.start, sel.end);

    if (ran == undefined) {
      reject('NO_WORD');
    }
    else {

      let doc = currentEditor.document;
      let lineNumber = ran.start.line;
      let item = doc.getText(ran);
      let idx = doc.lineAt(lineNumber).firstNonWhitespaceCharacterIndex;
      let ind = doc.lineAt(lineNumber).text.substring(0, idx);
      let wrapData = { txt: getSetting('wrapText'), item: item, doc: doc, ran: ran, idx: idx, ind: ind, line: lineNumber, sel: sel, lastLine: doc.lineCount - 1 == lineNumber };
      if (prefix || getSetting("alwaysUsePrefix")) {
        if (getSetting("alwaysInputBoxOnPrefix") == true) {
          vscode.window.showInputBox({ placeHolder: 'Prefix string', value: '', prompt: 'Use text from input box as prefix' }).then((val) => {
            if (val != undefined) {
              wrapData.txt = "console.log('".concat(val.trim(), "', ", wrapData.item, ");");
              resolve(wrapData)
            }
          })
        } else {
          wrapData.txt = "console.log('".concat(wrapData.item, "', ", wrapData.item, ");");
          resolve(wrapData)
        }
      } else {
        switch (formatAs) {
          case FormatAs.String:
            wrapData.txt = wrapData.txt.replace('$txt', "'".concat(item, "'"));
            break;

          case FormatAs.Object:
            wrapData.txt = wrapData.txt.replace('$txt', "{ ".concat(item, " }"));
            break;

          default:
            wrapData.txt = wrapData.txt.replace('$txt', item);
            break;
        }

        resolve(wrapData);
      }
    };

  }).then((wrap: WrapData) => {

    let onEmptyAction = getSetting("onEmptyLineAction");
    let setCursor = getSetting("setCursorOnNewLine");

    function SetCursor(l) {

      let tpos;
      switch (getSetting('cursorPositionNewLine')) {

        case 'Same':
          tpos = new vscode.Position(l, currentEditor.selection.anchor.character);
          break;

        case 'Right':
          tpos = new vscode.Position(l, currentEditor.document.lineAt(l).range.end.character);
          break;

        case 'Left':
          tpos = new vscode.Position(l, currentEditor.document.lineAt(l).range.start.character);
          break;

        default:
          break;
      }
      currentEditor.selection = new vscode.Selection(tpos, tpos)
    }

    function getTargetLine() {
      let stop = false;
      let li = wrap.line;
      let l = 0;
      while (!stop) {
        li++;
        if (li < wrap.doc.lineCount) {
          if (!wrap.doc.lineAt(li).isEmptyOrWhitespace) {
            l = li; stop = true;
          }
        } else {
          if (li == wrap.doc.lineCount) li--;
          stop = true;
        }
      }
      return li;
    }

    let nxtLine: vscode.TextLine;
    let nxtLineInd: string;
    let nxtNonEmpty: vscode.TextLine

    if (!wrap.lastLine) {
      nxtLine = wrap.doc.lineAt(wrap.line + 1);
      nxtLineInd = nxtLine.text.substring(0, nxtLine.firstNonWhitespaceCharacterIndex);
    } else {
      nxtLineInd = "";
    }

    wrap.ind = vscode.workspace.getConfiguration("wrap-console-log-lite")["autoFormat"] == true ? "" : wrap.ind;
    let pos = new vscode.Position(wrap.line, wrap.doc.lineAt(wrap.line).range.end.character);

    currentEditor.edit((e) => {
      let nxtNonEmpty;
      if (nxtLine) {
        nxtNonEmpty = (nxtLine.isEmptyOrWhitespace) ? wrap.doc.lineAt(getTargetLine()) : undefined;
      }
      if (wrap.lastLine == false && nxtLine.isEmptyOrWhitespace) {
        if (onEmptyAction == "Insert") {
          e.insert(new vscode.Position(wrap.line, wrap.doc.lineAt(wrap.line).range.end.character), "\n".concat((nxtLineInd > wrap.ind ? nxtLineInd : wrap.ind), wrap.txt));
        } else if (onEmptyAction == "Replace") {
          if (nxtLine && (nxtNonEmpty.firstNonWhitespaceCharacterIndex > 0)) {
            e.replace(new vscode.Position(nxtLine.lineNumber, 0), " ".repeat(nxtNonEmpty.firstNonWhitespaceCharacterIndex).concat(wrap.txt));
          } else {
            e.replace(new vscode.Position(nxtLine.lineNumber, 0), wrap.ind.concat(wrap.txt));
          }
        }
      } else {
        e.insert(new vscode.Position(wrap.line, wrap.doc.lineAt(wrap.line).range.end.character),
          "\n".concat((nxtLineInd.length > wrap.ind.length ? nxtLineInd : wrap.ind), wrap.txt));
      }
    }).then(() => {
      if (nxtLine == undefined) {
        nxtLine = wrap.doc.lineAt(wrap.line + 1);
      }
      if (getSetting("autoFormat") == true && !wrap.lastLine) {
        let nextLineEnd = wrap.doc.lineAt(wrap.line + 2).range.end;
        currentEditor.selection = new vscode.Selection(wrap.sel.start, nextLineEnd)
        vscode.commands.executeCommand("currentEditor.action.formatSelection").then(() => {
          currentEditor.selection = wrap.sel;
        }, (err) => {
          vscode.window.showErrorMessage("'formatSelection' could not execute propertly");
          console.error(err);
        })
      } else {
        currentEditor.selection = wrap.sel;
      }
      if (setCursor) SetCursor(nxtLine.lineNumber);
    })
    if (getSetting("formatDocument") == true) {
      vscode.commands.executeCommand("editor.action.formatDocument");
    }

  }).catch(message => {
    console.log('vscode-wrap-console REJECTED_PROMISE : ' + message);
  });

}

function getSetting(setting: string) {
  return vscode.workspace.getConfiguration("wrap-console-log-lite")[setting]
}

interface WrapData {
  txt: string,
  item: string,
  sel: vscode.Selection,
  doc: vscode.TextDocument,
  ran: vscode.Range,
  ind: string,
  idx: number,
  line: number,
  lastLine: boolean
}

enum FormatAs {
  String,
  Object
}

export function deactivate() {
  return undefined;
}

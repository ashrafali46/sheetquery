import type { Spreadsheet, Sheet } from 'gasmask/src/SpreadsheetApp';

/**
 * Run new sheet query
 *
 * @param {Spreadsheet} activeSpreadsheet Specific spreadsheet to use, or will use SpreadsheetApp.getActiveSpreadsheet() if undefined\
 * @return {SheetQueryBuilder}
 */
export function sheetQuery(activeSpreadsheet?: any) {
  return new SheetQueryBuilder(activeSpreadsheet);
}

export type DictObject = { [key: string]: any };
export type RowObject = { [key: string]: any, __meta: { row: number, cols: number } };
export type WhereFn = (row: RowObject) => boolean;
export type UpdateFn = (row: RowObject) => RowObject | undefined;

// SpreadsheetApp comes from Google Apps Script
declare var SpreadsheetApp: any;

/**
 * SheetQueryBuilder class - Kind of an ORM for Google Sheets
 */
export class SheetQueryBuilder {
  activeSpreadsheet: any;
  columnNames: string[] = [];
  sheetName: string | undefined;
  whereFn: WhereFn | undefined;

  _sheet: any;
  _sheetValues: any;
  _sheetHeadings: string[] = [];

  constructor(activeSpreadsheet?: any) {
    this.activeSpreadsheet = activeSpreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  }

  select(columnNames: string | string[]) {
    this.columnNames = Array.isArray(columnNames) ? columnNames : [columnNames];

    return this;
  }

  /**
   * Name of spreadsheet to perform operations on
   *
   * @param {string} sheetName
   * @return {SheetQueryBuilder}
   */
  from(sheetName: string) {
    this.sheetName = sheetName;

    return this;
  }

  /**
   * Apply a filtering function on rows in a spreadsheet before performing an operation on them
   *
   * @param {Function} fn
   * @return {SheetQueryBuilder}
   */
  where(fn: WhereFn) {
    this.whereFn = fn;

    return this;
  }

  /**
   * Delete matched rows from spreadsheet
   *
   * @return {SheetQueryBuilder}
   */
  deleteRows() {
    const rows = this.getRows();
    let i = 0;

    rows.forEach((row: RowObject) => {
      const deleteRowRange = this._sheet.getRange(row.__meta.row - i, 1, 1, row.__meta.cols);

      deleteRowRange.deleteCells(SpreadsheetApp.Dimension.ROWS);
      i++;
    });

    this.clearCache();
    return this;
  }

  /**
   * Update matched rows in spreadsheet with provided function
   *
   * @param {UpdateFn} updateFn
   * @return {SheetQueryBuilder}
   */
  updateRows(updateFn: UpdateFn) {
    const rows = this.getRows();

    rows.forEach((row: any) => {
      const updateRowRange = this._sheet.getRange(row.__meta.row, 1, 1, row.__meta.cols);
      const updatedRow: any = updateFn(row);
      let arrayValues = [];

      if (updatedRow && updatedRow.__meta) {
        delete updatedRow.__meta;
        arrayValues = Object.values(updatedRow);
      } else {
        delete row.__meta;
        arrayValues = Object.values(row);
      }

      updateRowRange.setValues([arrayValues]);
    });

    this.clearCache();
    return this;
  }

  /**
   * Get Sheet object that is referenced by the current query from() method
   *
   * @return {Sheet}
   */
  getSheet() {
    if (!this._sheet) {
      this._sheet = this.activeSpreadsheet.getSheetByName(this.sheetName);
    }

    return this._sheet;
  }

  /**
   * Get values in sheet from current query + where condition
   */
  getValues() {
    if (!this._sheetValues) {
      const sheet = this.getSheet();
      const numCols = sheet.getLastColumn();
      const rowValues = [];
      const sheetValues = sheet.getSheetValues(2, 1, sheet.getLastRow(), numCols);
      const numRows = sheetValues.length;
      const headings = this.getHeadings();

      for(let r = 0; r < numRows; r++) {
        const obj = { __meta: { row: r + 2, cols: numCols } }; // 2 = 0-based and heading row

        for(let c = 0; c < numCols; c++) {
          // @ts-expect-error: Headings are set already above, so possibility of an error here is nil
          obj[headings[c]] = sheetValues[r][c]; // @ts-ignore
        }

        rowValues.push(obj)
      }

      this._sheetValues = rowValues;
    }

    return this._sheetValues;
  }

  /**
   * Return matching rows from sheet query
   *
   * @return {RowObject[]}
   */
  getRows(): RowObject[] {
    const sheetValues = this.getValues();

    return this.whereFn ? sheetValues.filter(this.whereFn) : sheetValues;
  }

  /**
   * Get array of headings in current sheet from()
   *
   * @return {string[]}
   */
  getHeadings(): string[] {
    if (!this._sheetHeadings || !this._sheetHeadings.length) {
      const sheet = this.getSheet();
      const numCols = sheet.getLastColumn();

      this._sheetHeadings = sheet.getSheetValues(1, 1, 1, numCols)[0];
    }

    return this._sheetHeadings;
  }

  /**
   * Insert new rows into the spreadsheet
   * Arrays of objects like { Heading: Value }
   *
   * @param {DictObject[]} newRows - Array of row objects to insert
   * @return {SheetQueryBuilder}
   */
  insertRows(newRows: DictObject[]) {
    const sheet = this.getSheet();
    const headings = this.getHeadings();

    newRows.forEach(row => {
      const rowValues = headings.map(heading => {
        return row[heading] ? row[heading] : '';
      });

      sheet.appendRow(rowValues);
    });

    return this;
  }

  /**
   * Clear cached values, headings, and flush all operations to sheet
   *
   * @return {SheetQueryBuilder}
   */
  clearCache() {
    this._sheetValues = null;
    this._sheetHeadings = [];

    SpreadsheetApp.flush();

    return this;
  }
}


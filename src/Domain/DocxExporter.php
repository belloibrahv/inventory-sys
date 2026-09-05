<?php
declare(strict_types=1);

namespace Atoms\Domain;

/**
 * Minimal Office Open XML (.docx) builder — no Composer dependency.
 */
final class DocxExporter
{
    /**
     * @param list<string>              $headers
     * @param list<list<string|int|float|null>> $rows
     */
    public function fromTable(string $title, array $headers, array $rows): string
    {
        if (!class_exists(\ZipArchive::class)) {
            throw new DomainException('Word export needs the PHP Zip extension on this server.');
        }

        $tmp = tempnam(sys_get_temp_dir(), 'atoms-docx-');
        if ($tmp === false) {
            throw new DomainException('Could not create a temporary Word file.');
        }
        $path = $tmp . '.docx';
        @unlink($tmp);

        $zip = new \ZipArchive();
        if ($zip->open($path, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
            throw new DomainException('Could not build the Word document.');
        }

        $zip->addFromString('[Content_Types].xml', $this->contentTypes());
        $zip->addFromString('_rels/.rels', $this->rels());
        $zip->addFromString('word/document.xml', $this->document($title, $headers, $rows));
        $zip->addFromString('word/_rels/document.xml.rels', $this->documentRels());
        $zip->close();

        $binary = file_get_contents($path);
        @unlink($path);
        if ($binary === false || $binary === '') {
            throw new DomainException('Could not read the Word document.');
        }

        return $binary;
    }

    /**
     * @param list<string>              $headers
     * @param list<list<string|int|float|null>> $rows
     */
    private function document(string $title, array $headers, array $rows): string
    {
        $body = $this->paragraph($title, true);
        $body .= $this->paragraph('Generated ' . gmdate('Y-m-d H:i') . ' UTC', false);
        $body .= $this->table($headers, $rows);

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            . '<w:body>' . $body . '</w:body></w:document>';
    }

    private function paragraph(string $text, bool $bold): string
    {
        $rPr = $bold ? '<w:rPr><w:b/><w:sz w:val="28"/></w:rPr>' : '';

        return '<w:p><w:r>' . $rPr . '<w:t xml:space="preserve">' . $this->xml($text) . '</w:t></w:r></w:p>';
    }

    /**
     * @param list<string>              $headers
     * @param list<list<string|int|float|null>> $rows
     */
    private function table(array $headers, array $rows): string
    {
        $xml = '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>'
            . '<w:top w:val="single" w:sz="4" w:color="CBD5E1"/>'
            . '<w:left w:val="single" w:sz="4" w:color="CBD5E1"/>'
            . '<w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/>'
            . '<w:right w:val="single" w:sz="4" w:color="CBD5E1"/>'
            . '<w:insideH w:val="single" w:sz="4" w:color="CBD5E1"/>'
            . '<w:insideV w:val="single" w:sz="4" w:color="CBD5E1"/>'
            . '</w:tblBorders></w:tblPr>';
        $xml .= $this->tableRow($headers, true);
        foreach ($rows as $row) {
            $cells = [];
            foreach ($headers as $i => $_) {
                $cells[] = $row[$i] ?? '';
            }
            $xml .= $this->tableRow($cells, false);
        }
        $xml .= '</w:tbl>';

        return $xml;
    }

    /**
     * @param list<string|int|float|null> $cells
     */
    private function tableRow(array $cells, bool $header): string
    {
        $xml = '<w:tr>';
        foreach ($cells as $cell) {
            $text = $this->xml((string) ($cell ?? ''));
            $shd  = $header ? '<w:tcPr><w:shd w:val="clear" w:fill="EEF2FF"/></w:tcPr>' : '<w:tcPr/>';
            $bold = $header ? '<w:rPr><w:b/></w:rPr>' : '';
            $xml .= '<w:tc>' . $shd . '<w:p><w:r>' . $bold . '<w:t xml:space="preserve">' . $text . '</w:t></w:r></w:p></w:tc>';
        }

        return $xml . '</w:tr>';
    }

    private function xml(string $text): string
    {
        return htmlspecialchars($text, ENT_QUOTES | ENT_XML1, 'UTF-8');
    }

    private function contentTypes(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            . '</Types>';
    }

    private function rels(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
            . '</Relationships>';
    }

    private function documentRels(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    }
}

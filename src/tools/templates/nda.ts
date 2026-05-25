export function generarNDAHtml(datos: {
  nombreCliente: string;
  emailCliente: string;
  fecha: string;
  propiedadTitulo?: string;
  propiedadReferencia?: string;
}): string {
  const { nombreCliente, emailCliente, fecha, propiedadTitulo, propiedadReferencia } = datos;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Georgia', serif; color: #1a1a1a; background: #fff; padding: 60px; font-size: 13px; line-height: 1.8; }
  .header { text-align: center; margin-bottom: 48px; border-bottom: 1px solid #c8a96a; padding-bottom: 32px; }
  .logo { font-size: 11px; letter-spacing: 6px; text-transform: uppercase; color: #8a7a6a; margin-bottom: 12px; }
  .title { font-size: 22px; font-weight: normal; color: #1a1a1a; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
  .subtitle { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #8a7a6a; }
  .gold { color: #c8a96a; }
  .section { margin-bottom: 32px; }
  .section-title { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #c8a96a; margin-bottom: 12px; border-bottom: 1px solid #f0ebe0; padding-bottom: 6px; }
  .parties-box { background: #f8f6f0; padding: 24px; border-left: 3px solid #c8a96a; margin-bottom: 24px; }
  .party-label { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #8a7a6a; margin-bottom: 4px; }
  .party-name { font-size: 15px; color: #1a1a1a; margin-bottom: 2px; }
  .party-detail { font-size: 12px; color: #5a5a5a; }
  .clause { margin-bottom: 20px; }
  .clause-num { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #8a7a6a; margin-bottom: 6px; }
  .clause-text { color: #2a2a2a; }
  .signature-block { margin-top: 60px; display: flex; justify-content: space-between; }
  .signature-box { width: 45%; }
  .signature-line { border-top: 1px solid #1a1a1a; margin-bottom: 8px; padding-top: 8px; }
  .signature-label { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #8a7a6a; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e8e0d0; font-size: 10px; color: #8a7a6a; text-align: center; letter-spacing: 1px; }
  .property-box { background: #f8f6f0; padding: 16px 24px; border-left: 3px solid #c8a96a; margin: 16px 0; }
</style>
</head>
<body>

<div class="header">
  <div class="logo">The Edit Marbella — Real Estate</div>
  <div class="title">Acuerdo de Confidencialidad</div>
  <div class="subtitle">Non-Disclosure Agreement · NDA</div>
</div>

<div class="section">
  <div class="section-title">Las Partes / The Parties</div>
  <div class="parties-box">
    <div class="party-label">Parte Divulgadora / Disclosing Party</div>
    <div class="party-name">The Edit Marbella S.L.</div>
    <div class="party-detail">Agencia inmobiliaria de lujo · Marbella, España</div>
  </div>
  <div class="parties-box">
    <div class="party-label">Parte Receptora / Receiving Party</div>
    <div class="party-name">${nombreCliente}</div>
    <div class="party-detail">${emailCliente}</div>
  </div>
</div>

${propiedadTitulo ? `
<div class="section">
  <div class="section-title">Propiedad de Referencia / Referenced Property</div>
  <div class="property-box">
    <div class="party-name">${propiedadTitulo}</div>
    ${propiedadReferencia ? `<div class="party-detail">Ref: ${propiedadReferencia}</div>` : ''}
  </div>
</div>` : ''}

<div class="section">
  <div class="section-title">Términos y Condiciones / Terms & Conditions</div>

  <div class="clause">
    <div class="clause-num">1. Objeto / Purpose</div>
    <div class="clause-text">
      El presente acuerdo tiene por objeto establecer las condiciones bajo las cuales The Edit Marbella facilitará al Cliente información confidencial relativa a propiedades inmobiliarias de carácter exclusivo y/o off-market en la Costa del Sol, España.
      <br><br>
      <em>This agreement sets forth the terms under which The Edit Marbella will provide the Client with confidential information regarding exclusive and/or off-market real estate properties on the Costa del Sol, Spain.</em>
    </div>
  </div>

  <div class="clause">
    <div class="clause-num">2. Información Confidencial / Confidential Information</div>
    <div class="clause-text">
      Se considera información confidencial toda aquella relativa a: precios de venta, datos de los propietarios, planos, memorias de calidades, historial de la propiedad, condiciones de venta y cualquier otra información facilitada de forma verbal, escrita o digital.
      <br><br>
      <em>Confidential information includes: sale prices, owner data, floor plans, material specifications, property history, sale conditions, and any other information provided verbally, in writing, or digitally.</em>
    </div>
  </div>

  <div class="clause">
    <div class="clause-num">3. Obligaciones / Obligations</div>
    <div class="clause-text">
      La Parte Receptora se compromete a: (i) mantener en estricta confidencialidad toda la información recibida; (ii) no divulgar, compartir ni reproducir dicha información a terceros sin consentimiento expreso; (iii) utilizar la información exclusivamente para evaluar una posible operación inmobiliaria.
      <br><br>
      <em>The Receiving Party agrees to: (i) keep all received information strictly confidential; (ii) not disclose, share or reproduce said information to third parties without express consent; (iii) use the information solely to evaluate a potential real estate transaction.</em>
    </div>
  </div>

  <div class="clause">
    <div class="clause-num">4. Vigencia / Term</div>
    <div class="clause-text">
      El presente acuerdo tendrá una vigencia de dos (2) años desde la fecha de firma, salvo que las partes acuerden expresamente su renovación o terminación anticipada.
      <br><br>
      <em>This agreement shall remain in force for two (2) years from the date of signature, unless the parties expressly agree to its renewal or early termination.</em>
    </div>
  </div>

  <div class="clause">
    <div class="clause-num">5. Ley Aplicable / Governing Law</div>
    <div class="clause-text">
      Este acuerdo se regirá e interpretará de conformidad con la legislación española. Las partes se someten expresamente a la jurisdicción de los Juzgados y Tribunales de Marbella para cualquier controversia.
      <br><br>
      <em>This agreement shall be governed by Spanish law. The parties expressly submit to the jurisdiction of the Courts of Marbella for any dispute.</em>
    </div>
  </div>
</div>

<div class="section">
  <div class="clause-num">Fecha / Date: ${fecha}</div>
</div>

<div class="signature-block">
  <div class="signature-box">
    <div class="signature-line"></div>
    <div class="signature-label">The Edit Marbella S.L.</div>
    <div class="party-detail" style="font-size:11px; margin-top: 4px;">Parte Divulgadora / Disclosing Party</div>
  </div>
  <div class="signature-box">
    <div class="signature-line"></div>
    <div class="signature-label">${nombreCliente}</div>
    <div class="party-detail" style="font-size:11px; margin-top: 4px;">Parte Receptora / Receiving Party</div>
  </div>
</div>

<div class="footer">
  The Edit Marbella · Acuerdo de Confidencialidad · ${fecha} · Documento generado por Harvis Real Estate Intelligence
</div>

</body>
</html>`;
}

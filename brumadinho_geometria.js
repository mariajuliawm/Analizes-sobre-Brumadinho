//ÁREA DE ANÁLISE ABRABGENTE 
var barragem_bru = ee.Geometry.Point([-44.12139, -20.11972]);
var box_bru = ee.Geometry.Rectangle([-44.18, -20.24, -44.03, -20.06]);
Map.centerObject(barragem_bru, 12);
Map.addLayer(box_bru, { color: 'pink'}, 'Área de análise');

// PROCESSAMENTO DAS NUVENS:
function mascaraNuvem(img) { var scl = img.select('SCL'); return img.updateMask( scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)));}

// CÁLCULO DE ÍNDICES:
function calcularIndices(img) { 
  var ndvi = img.normalizedDifference(['B8', 'B4']) .rename('NDVI'); 
  var mndwi = img.normalizedDifference(['B3',  'B11']).rename('MNDWI');
  var ndmi  = img.normalizedDifference(['B8',  'B11']).rename('NDMI');
  var bsi   = img.expression('((SWIR1 + RED) - (NIR + BLUE)) / ((SWIR1 + RED) + (NIR + BLUE))', {
      'SWIR1': img.select('B11'),
      'RED'  : img.select('B4'),
      'NIR'  : img.select('B8'),
      'BLUE' : img.select('B2')}).rename('BSI');
  var evi   = img.expression('2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
      'NIR' : img.select('B8'),
      'RED' : img.select('B4'),
      'BLUE': img.select('B2')}).rename('EVI');
  return img.addBands([ndvi, mndwi, ndmi, bsi, evi]);}

// Função para obter a imagem:
function getImagem(inicio, fim) { return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(box_bru)
    .filterDate(inicio, fim)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
    .map(mascaraNuvem)
    .map(calcularIndices)
    .median()
    .clip(box_bru);}


// Definir períodos:
var pre = getImagem('2018-11-01', '2019-01-24');
var posImedi = getImagem('2019-01-26', '2019-03-31');
var pos6m = getImagem('2019-07-01', '2019-08-31');
var pos1ano = getImagem('2020-01-01', '2020-03-31');
var pos2anos = getImagem('2021-01-01', '2021-03-31');
var pos5anos = getImagem('2024-01-01', '2024-03-31');

// Delta NDVI
var deltaNDVI = posImedi.select('NDVI') .subtract(pre.select('NDVI')).rename('deltaNDVI');

// Duplo critério: ndvi (queda de vegetação) e bsi (aumento do solo exposto)
var mancha = deltaNDVI.lt(-0.2) .and(posImedi.select('BSI').gt(0.05));

// Converter os pixeis em poligonos: 
var mancha_vetor = mancha.selfMask()
  .reduceToVectors({ geometry: box_bru, scale: 20, geometryType: 'polygon', eightConnected: true, maxPixels: 1e9, bestEffort: true});
  // eightconnected: pixeis na diagonal tbm são vizinhos; bestEffort: se o arquivo estiver mt pesado, reduz a qualidade
Map.addLayer( mancha_vetor, {color: '#f567c3'},'Mancha vetorial');
print('Nº de fragmentos detectados:',mancha_vetor.size());
 
// Adicionar shapefile oficial
var areaOficial = ee.FeatureCollection('projects/inpe-496912/assets/ide_250102_mg_impactos_ambientais_pol');
var poligonoOficial = areaOficial.geometry(); //extrai a geometria 
Map.addLayer(ee.Image().byte().paint(areaOficial, 0, 2), {palette: ['#FF6600']}, 'Contorno área oficial');
  // ee.Image: cria iamgem vazia; .byte(): converte p inteiro de 8 bits (???); .paint(vetor desenhado, valor do pixel, largura da borda )

// Comparação entre os dados:
  // Área detectada
var areaDetectadaHa = mancha_vetor.geometry()
  .area(1) // 1 m = margem de erro/tolerância espacial
  .divide(1e4); // converte m² para hectares
  
  // Área oficial do shapefile
var areaOficialHa = poligonoOficial.area(1).divide(1e4);

  // Área comum entre os polígonos (interseção)
var intersecao = mancha_vetor.geometry().intersection(poligonoOficial, 1); 
var areaIntersecaoHa = intersecao.area(1).divide(1e4);

  // IoU = interseção / união * 100. Mede a sobreposição entre os polígonos
var iou = areaIntersecaoHa.divide(areaDetectadaHa.add(areaOficialHa).subtract(areaIntersecaoHa)).multiply(100);

  // Comparação simples entre as áreas
var comp_area = areaDetectadaHa.divide(areaOficialHa).multiply(100);

// Resultados
print('Área detectada (ha):', areaDetectadaHa);
print('Área oficial shapefile (ha):', areaOficialHa);
print('Área de interseção (ha):', areaIntersecaoHa);
print('Comparação entre áreas (%):', comp_area);
print('IoU — sobreposição espacial (%):', iou);

// Recuperação:
var quedaNDVI = posImedi.select('NDVI').subtract(pre.select('NDVI')); // queda inicial do NDVI após o desastre
var recuperacao5anos = pos5anos.select('NDVI').subtract(posImedi.select('NDVI')); // Recuperação após 5 anos
var taxaRecuperacao = recuperacao5anos.divide(quedaNDVI.abs()).updateMask(quedaNDVI.abs().gt(0.1)).rename('taxaRecuperacao');
Map.addLayer(taxaRecuperacao.clip(mancha_vetor), {min: 0, max: 1,palette: ['#d73027','#fdae61','#ffffbf','#a6d96a','#1a9850']}, 
'Taxa de recuperação (+5 anos)', false);



// Gráficos p analise temporal:
  //Criar uma coleç˜ão temporal:
// Coleção temporal
var colecao = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(box_bru) .filterDate('2018-01-01', '2024-12-31')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) .map(mascaraNuvem) .map(calcularIndices);

  // Gráfico para área encontrada:
  
var grafico = ui.Chart.image.series({imageCollection: colecao.select(['NDVI', 'EVI', 'MNDWI']),
  region: mancha_vetor, reducer: ee.Reducer.mean(), scale: 20, xProperty: 'system:time_start'})
  .setOptions({
  title    : 'Série temporal — Polígono detectado automaticamente',
  vAxis    : {title: 'Valor do índice', viewWindow: {min: -0.4, max: 0.9}},
  hAxis    : {title: 'Data'},
  lineWidth: 2,
  pointSize: 3,
  colors   : ['#1a9850', '#2c7bb6', '#d7191c'],
  series   : {
    0: {labelInLegend: 'NDVI'},
    1: {labelInLegend: 'EVI'},
    2: {labelInLegend: 'MNDWI'}}});
print(grafico);

// Gráfico para análise temporal do shapefile oficial

var grafico_shapefile = ui.Chart.image.series({imageCollection: colecao.select(['NDVI', 'EVI', 'MNDWI']),
  region: poligonoOficial, reducer: ee.Reducer.mean(), scale: 20, xProperty: 'system:time_start'})
  .setOptions({ title: 'Série temporal — Área oficial do shapefile',
  vAxis: { title: 'Valor do índice', viewWindow: {min: -0.4, max: 0.9}},
  hAxis: {title: 'Data'},
  lineWidth: 2,
  pointSize: 3,
  colors: ['#1a9850', '#2c7bb6', '#d7191c'],
  series: {
    0: {labelInLegend: 'NDVI'},
    1: {labelInLegend: 'EVI'},
    2: {labelInLegend: 'MNDWI'}}});

print(grafico_shapefile);

// Tabela comparativa:
  // Médias- poligono detectado 
var mediaDetectado = posImedi.reduceRegion({reducer: ee.Reducer.mean(),geometry: mancha_vetor.geometry(), scale: 20,
  maxPixels: 1e9}); // cria um dicionário com as médias de ndvi, evi e bsi
var deltaDetectado = deltaNDVI.reduceRegion({reducer: ee.Reducer.mean(), geometry: mancha_vetor.geometry(), scale: 20,
  maxPixels: 1e9}); // calcula a média de variação de ndvi
var recuperacaoDetectado = taxaRecuperacao.reduceRegion({reducer: ee.Reducer.mean(), geometry: mancha_vetor.geometry(), scale: 20,
  maxPixels: 1e9}); // calcula a taxa de recuperação

  // Médias - poligono importado (shapefile)
var mediaOficial = posImedi.reduceRegion({reducer: ee.Reducer.mean(), geometry: poligonoOficial, scale: 20,
  maxPixels: 1e9}); // cria um dicionário com as médias de ndvi, evi e bsi
var deltaOficial = deltaNDVI.reduceRegion({reducer: ee.Reducer.mean(),geometry: poligonoOficial, scale: 20, 
  maxPixels: 1e9});// calcula a média de variação de ndvi
var recuperacaoOficial = taxaRecuperacao.reduceRegion({reducer: ee.Reducer.mean(), geometry: poligonoOficial, scale: 20,
maxPixels: 1e9}); // calcula a taxa de recuperação
  
  // Polígono detectado
var tabelaDetectado = ee.Dictionary({
  'Área (ha)': areaDetectadaHa,
  'NDVI': mediaDetectado.get('NDVI'),
  'EVI': mediaDetectado.get('EVI'),
  'MNDWI': mediaDetectado.get('MNDWI'),
  'NDMI': mediaDetectado.get('NDMI'),
  'BSI': mediaDetectado.get('BSI'),
  'Delta NDVI': deltaDetectado.get('deltaNDVI'),
  'Taxa recuperação': recuperacaoDetectado.get('taxaRecuperacao'),
  'IoU (%)': iou,
  'Comp. área (%)': comp_area
});

  // Shapefile oficial
var tabelaOficial = ee.Dictionary({
  'Área (ha)': areaOficialHa,
  'NDVI': mediaOficial.get('NDVI'),
  'EVI': mediaOficial.get('EVI'),
  'MNDWI': mediaOficial.get('MNDWI'),
  'NDMI': mediaOficial.get('NDMI'),
  'BSI': mediaOficial.get('BSI'),
  'Delta NDVI': deltaOficial.get('deltaNDVI'),
  'Taxa recuperação': recuperacaoOficial.get('taxaRecuperacao'),
  'IoU (%)': iou,
  'Comp. área (%)': comp_area
});

  // Mostrar tabelas
print('Polígono detectado automaticamente:', tabelaDetectado);
print('Shapefile oficial:', tabelaOficial);
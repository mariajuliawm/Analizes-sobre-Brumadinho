/*
Projeto: Análise de Impacto Ambiental - Brumadinho
Autor: Maria Júlia Wada Morelli
Descrição: Este código tem como objetivo analisar o impacto ambiental causado pelo rompimento da barragem B1 em Brumadinho, Minas Gerais, utilizando dados de satélite Sentinel-2. O foco principal é a avaliação da vegetação e corpos d'água na região afetada, por meio do cálculo de índices como NDVI, EVI e MNDWI. O código também inclui a detecção de áreas com redução significativa de vegetação e a quantificação da área afetada, além de gerar gráficos para visualizar as mudanças ao longo do tempo.
*/

// 1 - ÁREA DE ESTUDO:

// define as coordenadas:
var barragem_bru = ee.Geometry.Point([-44.12139, -20.11972]);
var area_bru = barragem_bru.buffer(15000);

// centraliza o objeto no mapa
Map.centerObject(area_bru, 11);

// adiciona as camadas
Map.addLayer(area_bru, {color:'red'},'Área de estudo Brumadinho (15 km)');
Map.addLayer( barragem_bru, {color:'black'},'Barragem B1');

//2 - PROCESSAMENTO DA IMAGEM:

// define uma função reutilizavel chamada mascaranuvem
function mascaranuvem(img) { 
  
// selecionamos a banda scl (scene classification layer)
  var scl = img.select('SCL'); 
  var mascara = scl.neq(3)
                    .and (scl.neq(8)) // média prob
                    .and (scl.neq(9)) // alta prob
                    .and (scl.neq(10)); // cirrus
  return img.updateMask(mascara);}
  
//3 - CÁLCULO DOS ÍNDICES E ADD COMO NOVAS BANDAS
function calcularindices(img){
// .normalizeddifference é a fórmula (A-B)/(A+B)
  var ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI'); 
// .img.expression é a maneira de introduzir uma fórmula calculável   
  var evi = img.expression('2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
'NIR': img.select('B8'),
'RED': img.select('B4'),
'BLUE': img.select('B2')
}
  ).rename('EVI');
  var mndwi = img.normalizedDifference(['B3', 'B11']).rename('MNDWI');
return img.addBands([ndvi, evi, mndwi]);
}
 
 //4 - IMAGENS POR PERÍODO 
 function getImage(inicio, fim) 
 { return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterBounds(area_bru) // define a area de busca das imagens 
      .filterDate(inicio, fim)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) //filtra as imagens com mais de 20% de nuvem
      .map(mascaranuvem)
      .map(calcularindices)
      .median()
      .clip(area_bru);}

// PERÍODOS

var pre = getImage('2018-11-01', '2019-01-24');
var posImedi = getImage('2019-01-26', '2019-03-31');
var pos6m = getImage('2019-07-01', '2019-08-31');
var pos1ano = getImage('2020-01-01', '2020-03-31');
var pos2anos = getImage('2021-01-01', '2021-03-31');
var pos5anos = getImage('2024-01-01', '2024-03-31');

// VISUALIZAÇÃO NDVI

var visNDVI = { bands: ['NDVI'], min: -0.3, max: 0.8, palette: [ '#d73027', '#f46d43','#fdae61', 
'#ffffbf', '#a6d96a', '#66bd63','#1a9850']};


// MAPA

Map.addLayer( posImedi, visNDVI,'NDVI | Pós-imediato', true);

//
var colecao = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
.filterBounds(area_bru)
.filterDate('2018-01-01', '2024-12-31')
.filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
.map(mascaranuvem)
.map(calcularindices);

// GRÁFICO
var graficoNDVI = ui.Chart.image.series({ imageCollection: colecao.select('NDVI'), region: area_bru,
reducer: ee.Reducer.mean(), scale: 20, xProperty: 'system:time_start'})
.setOptions({ title: 'Série Temporal — NDVI médio (Buffer 15 km)', vAxis: {title: 'NDVI', 
viewWindow: {min: -0.2, max: 0.8}}, hAxis: {title: 'Data'}, lineWidth: 2, pointSize: 4, colors: ['#1a9850'],});
print(graficoNDVI);

// DETECÇÃO DO IMPACTO (variação do NDVI)
var deltaNDVI = posImedi.select('NDVI')
  .subtract(pre.select('NDVI'))
  .rename('deltaNDVI');

  // Áreas com redução forte de vegetação
var areaAfetada = deltaNDVI.lt(-0.15);

  // Visualização
Map.addLayer( areaAfetada.selfMask(), {palette: ['#FF0000']}, 'Área afetada', true); //selfMask torna transparentes os pixeis com valor 0 (n afetados)

// Quantificação da area afetada (multiplicar a area dos pixeis pela qnt. de pixeis 1)
var areaAfetadaKm2 = areaAfetada
  .multiply(ee.Image.pixelArea())
  .reduceRegion({ reducer: ee.Reducer.sum(), geometry: area_bru, scale: 20, maxPixels: 1e9});
// reduceRegion agrega todos os valores na geometria de interesse; .sum soma todas as areas de pixeis afetados (1)

print ('Área afetada estimada (km2):', ee.Number(areaAfetadaKm2.get('deltaNDVI')).divide(1e6).round());

// Valores médios por período:
function mediaPeriodo(imagem, nome) { var stats = imagem.select(['NDVI', 'EVI', 'MNDWI'])
  .reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: area_bru,
  scale: 20,
  maxPixels: 1e9});

print(nome, stats);}

mediaPeriodo(pre, 'Pré-evento');
mediaPeriodo(posImedi, 'Pós-imediato');
mediaPeriodo(pos6m, '+6 meses');
mediaPeriodo(pos1ano, '+1 ano');
mediaPeriodo(pos2anos, '+2 anos');
mediaPeriodo(pos5anos, '+5 anos');
  
  

  





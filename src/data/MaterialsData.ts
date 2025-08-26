// Tipagem para os materiais
export interface Material {
  Codigo: string;
  Material: string;
  Gramagem: string; // Mantido como string pois usa vírgula decimal (ex: "0,035")
  Und: number;
  Caixas: number;
  PPm: number;
}

// Dados de materiais
export const materialsData: Material[] = [
  { Codigo: "300061751", Material: "TORCIDA BACON 35GX26 PP", Gramagem: "0,035", Und: 26, Caixas: 150, PPm: 65 },
  { Codigo: "300061750", Material: "TORCIDA BACON 60GX24 PP", Gramagem: "0,060", Und: 24, Caixas: 135, PPm: 65 },
  { Codigo: "300061635", Material: "TORCIDA BACON 420GX16 PP", Gramagem: "0,420", Und: 16, Caixas: 16, PPm: 30 },
  { Codigo: "300061778", Material: "TORCIDA CHURRASCO 60GX24 PP", Gramagem: "0,060", Und: 24, Caixas: 135, PPm: 75 },
  { Codigo: "300061779", Material: "TORCIDA CHURRASCO 35GX26 PP", Gramagem: "0,035", Und: 26, Caixas: 150, PPm: 75 },
  { Codigo: "300047936", Material: "TORCIDA CHURRASCO 100GX27", Gramagem: "0,100", Und: 27, Caixas: 49, PPm: 65 },
  { Codigo: "300061633", Material: "TORCIDA CHURRASCO 120GX28 PP", Gramagem: "0,120", Und: 28, Caixas: 49, PPm: 65 },
  { Codigo: "300061777", Material: "TORCIDA COSTELA 35GX26 PP", Gramagem: "0,035", Und: 26, Caixas: 150, PPm: 75 },
  { Codigo: "300061776", Material: "TORCIDA COSTELA 60GX24 PP", Gramagem: "0,060", Und: 24, Caixas: 135, PPm: 75 },
  { Codigo: "300061775", Material: "TORCIDA PAO DE ALHO 35GX26 PP", Gramagem: "0,035", Und: 26, Caixas: 150, PPm: 75 },
  { Codigo: "300061774", Material: "TORCIDA PAO DE ALHO 60GX24 PP", Gramagem: "0,060", Und: 24, Caixas: 135, PPm: 75 },
  { Codigo: "300056662", Material: "TORCIDA PAO DE ALHO 100GX27", Gramagem: "0,100", Und: 27, Caixas: 49, PPm: 65 },
  { Codigo: "300061773", Material: "TORCIDA PIMENTA MEX 35GX26 PP", Gramagem: "0,035", Und: 26, Caixas: 150, PPm: 75 },
  { Codigo: "300061772", Material: "TORCIDA PIMENTA MEX 60GX24 PP", Gramagem: "0,060", Und: 24, Caixas: 135, PPm: 75 },
  { Codigo: "300047932", Material: "TORCIDA PIMENTA MEXICANA 100GX27", Gramagem: "0,100", Und: 27, Caixas: 49, PPm: 65 },
  { Codigo: "300061632", Material: "TORCIDA PIMENTA MEX 120GX28 PP", Gramagem: "0,120", Und: 28, Caixas: 49, PPm: 65 },
  { Codigo: "300061631", Material: "TORCIDA PIMENTA MEX 420GX16 PP", Gramagem: "0,420", Und: 16, Caixas: 21, PPm: 30 },
  { Codigo: "300061771", Material: "TORCIDA QUEIJO 35GX26 PP", Gramagem: "0,035", Und: 26, Caixas: 150, PPm: 75 },
  { Codigo: "300061770", Material: "TORCIDA QUEIJO 60GX24 PP", Gramagem: "0,060", Und: 24, Caixas: 135, PPm: 75 },
  { Codigo: "300047935", Material: "TORCIDA QUEIJO 100GX27", Gramagem: "0,100", Und: 27, Caixas: 49, PPm: 65 },
  { Codigo: "300061539", Material: "TORCIDA VINAGRETE 35GX26 PP", Gramagem: "0,035", Und: 26, Caixas: 150, PPm: 75 },
  { Codigo: "300061538", Material: "TORCIDA VINAGRETE 60GX24 PP", Gramagem: "0,060", Und: 24, Caixas: 135, PPm: 75 },
  { Codigo: "300058009", Material: "TORCIDA VINAGRETE 100GX27", Gramagem: "0,100", Und: 27, Caixas: 49, PPm: 65 },
  { Codigo: "300047934", Material: "TORCIDA CEBOLA 100GX27", Gramagem: "0,100", Und: 27, Caixas: 49, PPm: 65 },
  { Codigo: "300061725", Material: "TORCIDA CEBOLA 60GX24 PP", Gramagem: "0,060", Und: 24, Caixas: 135, PPm: 75 },
  { Codigo: "300061634", Material: "TORCIDA CEBOLA 420GX16 PP", Gramagem: "0,420", Und: 16, Caixas: 21, PPm: 30 },
  { Codigo: "300061727", Material: "TORCIDA CEBOLA 35GX26 PP", Gramagem: "0,035", Und: 26, Caixas: 150, PPm: 75 },
  { Codigo: "300047931", Material: "TORCIDA CAMARAO COM PIMENTA 100GX27", Gramagem: "0,100", Und: 27, Caixas: 49, PPm: 65 },
  { Codigo: "300061728", Material: "TORCIDA CAMARAO 60GX24 PP", Gramagem: "0,060", Und: 24, Caixas: 135, PPm: 75 },
  { Codigo: "300061729", Material: "TORCIDA CAMARAO 35GX26 PP", Gramagem: "0,035", Und: 26, Caixas: 150, PPm: 75 },
  { Codigo: "300062190", Material: "TORCIDA CX MISTA PIM E CHUR 60GX24X1", Gramagem: "0,060", Und: 24, Caixas: 135, PPm: 75 },
  { Codigo: "300062005", Material: "TORCIDA PIM MEXICANA 210GX20 PP", Gramagem: "0,210", Und: 20, Caixas: 42, PPm: 55 },
  { Codigo: "300062006", Material: "TORCIDA CHURRASCO 210GX20 PP", Gramagem: "0,210", Und: 20, Caixas: 42, PPm: 55 }
];

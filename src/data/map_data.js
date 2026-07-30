const provinces = [
    {
        "nome": "Portogallo",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 5,
        "y": 75
    },
    {
        "nome": "Leon",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 10,
        "y": 70
    },
    {
        "nome": "Castiglia",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 15,
        "y": 75
    },
    {
        "nome": "Navarra",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 20,
        "y": 70
    },
    {
        "nome": "Aragona",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 22,
        "y": 75
    },
    {
        "nome": "Galizia",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 8,
        "y": 65
    },
    {
        "nome": "Catalogna",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 25,
        "y": 75
    },
    {
        "nome": "Valencia",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 22,
        "y": 80
    },
    {
        "nome": "Siviglia",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 10,
        "y": 85
    },
    {
        "nome": "Granada",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 15,
        "y": 90
    },
    {
        "nome": "Cordoba",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 15,
        "y": 85
    },
    {
        "nome": "Toledo",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 15,
        "y": 80
    },
    {
        "nome": "Murcia",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 25,
        "y": 85
    },
    {
        "nome": "Normandia",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 30,
        "y": 50
    },
    {
        "nome": "Bretagna",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 20,
        "y": 55
    },
    {
        "nome": "Aquitania",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 25,
        "y": 65
    },
    {
        "nome": "Guascogna",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 25,
        "y": 70
    },
    {
        "nome": "Tolosa",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 30,
        "y": 70
    },
    {
        "nome": "Provenza",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 40,
        "y": 72
    },
    {
        "nome": "Borgogna",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 40,
        "y": 60
    },
    {
        "nome": "Ile de France",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 35,
        "y": 55
    },
    {
        "nome": "Fiandre",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 40,
        "y": 48
    },
    {
        "nome": "Piccardia",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 38,
        "y": 52
    },
    {
        "nome": "Champagne",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 42,
        "y": 55
    },
    {
        "nome": "Linguadoca",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 32,
        "y": 72
    },
    {
        "nome": "Delfinato",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 42,
        "y": 68
    },
    {
        "nome": "Angio",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 30,
        "y": 60
    },
    {
        "nome": "Poitou",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 28,
        "y": 62
    },
    {
        "nome": "Highlands",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 25,
        "y": 20
    },
    {
        "nome": "Irlanda",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 15,
        "y": 30
    },
    {
        "nome": "Galles",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 22,
        "y": 38
    },
    {
        "nome": "Wessex",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 20,
        "y": 42
    },
    {
        "nome": "Northumbria",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 28,
        "y": 30
    },
    {
        "nome": "Mercia",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 28,
        "y": 35
    },
    {
        "nome": "Essex",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 28,
        "y": 40
    },
    {
        "nome": "East Anglia",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 32,
        "y": 38
    },
    {
        "nome": "Savoia",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 44,
        "y": 70
    },
    {
        "nome": "Piemonte",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 46,
        "y": 72
    },
    {
        "nome": "Lombardia",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 48,
        "y": 72
    },
    {
        "nome": "Veneto",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 52,
        "y": 72
    },
    {
        "nome": "Emilia",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 50,
        "y": 75
    },
    {
        "nome": "Toscana",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 50,
        "y": 78
    },
    {
        "nome": "Stato della Chiesa",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 52,
        "y": 82
    },
    {
        "nome": "Napoli",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 55,
        "y": 85
    },
    {
        "nome": "Puglia",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 58,
        "y": 85
    },
    {
        "nome": "Calabria",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 56,
        "y": 90
    },
    {
        "nome": "Sicilia",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 54,
        "y": 95
    },
    {
        "nome": "Sardegna",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 45,
        "y": 85
    },
    {
        "nome": "Corsica",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 46,
        "y": 80
    },
    {
        "nome": "Olanda",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 42,
        "y": 45
    },
    {
        "nome": "Frisia",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 45,
        "y": 42
    },
    {
        "nome": "Lorena",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 42,
        "y": 58
    },
    {
        "nome": "Alsazia",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 44,
        "y": 60
    },
    {
        "nome": "Svevia",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 48,
        "y": 62
    },
    {
        "nome": "Baviera",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 52,
        "y": 62
    },
    {
        "nome": "Austria",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 55,
        "y": 65
    },
    {
        "nome": "Boemia",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 55,
        "y": 55
    },
    {
        "nome": "Moravia",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 60,
        "y": 58
    },
    {
        "nome": "Slesia",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 60,
        "y": 52
    },
    {
        "nome": "Brandeburgo",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 55,
        "y": 48
    },
    {
        "nome": "Sassonia",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 52,
        "y": 50
    },
    {
        "nome": "Pomerania",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 58,
        "y": 45
    },
    {
        "nome": "Franconia",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 50,
        "y": 58
    },
    {
        "nome": "Assia",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 48,
        "y": 55
    },
    {
        "nome": "Westfalia",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 45,
        "y": 50
    },
    {
        "nome": "Tirolo",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 50,
        "y": 68
    },
    {
        "nome": "Jutland",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 50,
        "y": 35
    },
    {
        "nome": "Norvegia",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 50,
        "y": 15
    },
    {
        "nome": "Svezia",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 60,
        "y": 15
    },
    {
        "nome": "Finlandia",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 75,
        "y": 10
    },
    {
        "nome": "Prussia",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 65,
        "y": 45
    },
    {
        "nome": "Livonia",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 70,
        "y": 40
    },
    {
        "nome": "Estonia",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 70,
        "y": 35
    },
    {
        "nome": "Lituania",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 75,
        "y": 45
    },
    {
        "nome": "Polonia",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 65,
        "y": 50
    },
    {
        "nome": "Mazovia",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 68,
        "y": 50
    },
    {
        "nome": "Ungheria",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 65,
        "y": 65
    },
    {
        "nome": "Transilvania",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 70,
        "y": 70
    },
    {
        "nome": "Moldavia",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 75,
        "y": 65
    },
    {
        "nome": "Valacchia",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 72,
        "y": 72
    },
    {
        "nome": "Croazia",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 58,
        "y": 72
    },
    {
        "nome": "Bosnia",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 62,
        "y": 75
    },
    {
        "nome": "Serbia",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 65,
        "y": 78
    },
    {
        "nome": "Bulgaria",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 70,
        "y": 75
    },
    {
        "nome": "Albania",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 62,
        "y": 82
    },
    {
        "nome": "Macedonia",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 68,
        "y": 82
    },
    {
        "nome": "Grecia",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 68,
        "y": 88
    },
    {
        "nome": "Tracia",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 75,
        "y": 80
    },
    {
        "nome": "Morea",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 68,
        "y": 92
    },
    {
        "nome": "Novgorod",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 80,
        "y": 20
    },
    {
        "nome": "Mosca",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 90,
        "y": 30
    },
    {
        "nome": "Kiev",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 80,
        "y": 50
    },
    {
        "nome": "Smolensk",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 80,
        "y": 40
    },
    {
        "nome": "Volinia",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 75,
        "y": 55
    },
    {
        "nome": "Podolia",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 78,
        "y": 60
    },
    {
        "nome": "Anatolia",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 82,
        "y": 85
    },
    {
        "nome": "Armenia",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 95,
        "y": 80
    },
    {
        "nome": "Trebisonda",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 85,
        "y": 80
    },
    {
        "nome": "Cilicia",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 85,
        "y": 88
    },
    {
        "nome": "Siria",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 90,
        "y": 90
    },
    {
        "nome": "Antiochia",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 88,
        "y": 88
    },
    {
        "nome": "Aleppo",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 92,
        "y": 88
    },
    {
        "nome": "Damasco",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 90,
        "y": 92
    },
    {
        "nome": "Gerusalemme",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 88,
        "y": 95
    },
    {
        "nome": "Cipro",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 82,
        "y": 92
    },
    {
        "nome": "Rodi",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 78,
        "y": 88
    },
    {
        "nome": "Creta",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 72,
        "y": 92
    },
    {
        "nome": "Egitto",
        "settore": "Artigianale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 80,
        "y": 95
    },
    {
        "nome": "Cirenaica",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 65,
        "y": 95
    },
    {
        "nome": "Tripolitania",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 55,
        "y": 95
    },
    {
        "nome": "Tunisia",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 48,
        "y": 92
    },
    {
        "nome": "Gabes",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 35,
        "y": 92
    },
    {
        "nome": "Fez",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 10,
        "y": 95
    },
    {
        "nome": "Marocco",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 5,
        "y": 95
    },
    {
        "nome": "Dalmazia",
        "settore": "Commerciale",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 60,
        "y": 75
    },
    {
        "nome": "Dobrudja",
        "settore": "Minerario",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 75,
        "y": 75
    },
    {
        "nome": "Skopia",
        "settore": "Agricolo",
        "popolazione": 100,
        "sviluppo": 1,
        "ricchezza": 0,
        "x": 65,
        "y": 85
    }
];
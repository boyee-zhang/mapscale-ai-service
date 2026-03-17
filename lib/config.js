// lib/config.js

export const CBS_CONFIG = {
    housing: {
        tableId: "83625ENG",
        regionField: "Regions",
        description: "Existing own homes; purchase price indices"
    },
    safety: {
        tableId: "83648NED",
        regionField: "RegioS",
        description: "Social safety; victimization, reasons for not reporting"
    },
    population: {
        tableId: "85618NED",
        regionField: "WijkenEnBuurten",
        description: "Key figures for districts and neighbourhoods"
    },
    traffic: {
        tableId: "84713NED",
        fullUrl: "https://opendata.cbs.nl/ODataFeed/odata/84713NED/UntypedDataSet?$filter=((Reismotieven eq '2030170') or (Reismotieven eq '2030190') or ...) and ((Populatie eq 'A048709')) and ((RegioS eq 'PV27    '))&$select=ID,Populatie,Geslacht,Persoonskenmerken,Reismotieven,Marges,RegioS,Perioden,Verplaatsingen_4,Afstand_5,Reisduur_6&$format=json",
        description: "Mobility; personal travel"
    }
};
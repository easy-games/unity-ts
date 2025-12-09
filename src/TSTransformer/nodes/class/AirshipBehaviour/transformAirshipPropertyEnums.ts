import crypto from "crypto";
import { EnumType } from "Shared/types";
import { EnumRecord } from "TSTransformer/classes/AirshipBuildState";
import { TransformState } from "TSTransformer/classes/TransformState";
import { EnumMetadata } from "TSTransformer/util/airshipBehaviourUtils";
import ts from "typescript";

interface EnumWriteInfo {
	readonly enumTypeString: string;
	readonly enumRef: string;
}

export function writeEnumInfo(
	state: TransformState,
	type: ts.Type,
	sourceFile: ts.SourceFile,
	enumInfo: EnumMetadata,
): EnumWriteInfo {
	const { record, enumType } = enumInfo;

	const enumName = state.airshipBuildState.getUniqueIdForType(state, type, sourceFile);
	const mts = state.airshipBuildState;
	if (mts.editorInfo.enum[enumName] === undefined) {
		mts.editorInfo.enum[enumName] = record;
	}

	return {
		enumTypeString: EnumType[enumType],
		enumRef: enumName,
	};
}

function getLiteralEnumName(state: TransformState, type: ts.UnionType) {
	let enumName = "";

	const aliasSymbol = type.aliasSymbol;
	if (aliasSymbol?.declarations !== undefined) {
		const [first] = aliasSymbol.declarations;
		const sourceFile = first.getSourceFile();

		enumName = state.airshipBuildState.getUniqueIdForType(state, type, sourceFile);
	} else {
		enumName = type.types.map(v => state.typeChecker.typeToString(v)).join("|");
		const sha1 = crypto.createHash("sha1");
		enumName = "::global@" + sha1.update(enumName).digest("hex");
	}

	return enumName;
}

export function writeLiteralUnionInfo(state: TransformState, type: ts.UnionType): EnumWriteInfo | undefined {
	if (type.types.every(type => type.isStringLiteral())) {
		const enumName = getLiteralEnumName(state, type);
		const mts = state.airshipBuildState;
		if (mts.editorInfo.enum[enumName] === undefined) {
			const enumRecord = {} as EnumRecord;
			const values = type.types.filter(f => f.isStringLiteral()).map(v => v.value);
			for (const value of values) {
				enumRecord[value] = value;
			}

			mts.editorInfo.enum[enumName] = enumRecord;
		}

		return {
			enumTypeString: "StringEnum",
			enumRef: enumName,
		};
	} else if (type.types.every(type => type.isNumberLiteral() && type.value % 1 === 0)) {
		const enumName = getLiteralEnumName(state, type);
		const mts = state.airshipBuildState;
		if (mts.editorInfo.enum[enumName] === undefined) {
			const enumRecord = {} as EnumRecord;
			const values = type.types.filter(f => f.isNumberLiteral()).map(v => v.value);
			for (const value of values) {
				enumRecord[value] = value;
			}

			mts.editorInfo.enum[enumName] = enumRecord;
		}

		return {
			enumTypeString: "IntEnum",
			enumRef: enumName,
		};
	}

	return undefined;
}
